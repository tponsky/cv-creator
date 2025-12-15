import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { parseEmailForCVEntries, EmailData } from '@/lib/email-parser';
import { sendEmailConfirmation } from '@/lib/email-notifications';

// Get first user (demo mode - no auth)
async function getDemoUser() {
    return await prisma.user.findFirst();
}

// Extract text from PDF buffer
async function extractPdfText(base64Content: string): Promise<string> {
    try {
        // Dynamic import for pdf-parse
        const pdfParseModule = await import('pdf-parse');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pdfParse = (pdfParseModule as any).default || pdfParseModule;
        const buffer = Buffer.from(base64Content, 'base64');
        const data = await pdfParse(buffer);
        return data.text || '';
    } catch (error) {
        console.error('PDF parsing error:', error);
        return '';
    }
}

// Process attachments and extract text
async function processAttachments(attachments: Array<{
    filename: string;
    content: string;
    content_type: string;
}>): Promise<string[]> {
    const extractedTexts: string[] = [];

    for (const attachment of attachments) {
        const filename = attachment.filename?.toLowerCase() || '';
        const contentType = attachment.content_type?.toLowerCase() || '';

        // PDF files
        if (contentType.includes('pdf') || filename.endsWith('.pdf')) {
            console.log(`Processing PDF attachment: ${attachment.filename}`);
            const text = await extractPdfText(attachment.content);
            if (text.trim()) {
                extractedTexts.push(`\n--- PDF ATTACHMENT: ${attachment.filename} ---\n${text}`);
            }
        }
        // Word documents - basic text extraction from .docx
        else if (contentType.includes('word') || filename.endsWith('.docx') || filename.endsWith('.doc')) {
            console.log(`Word attachment detected: ${attachment.filename} (text extraction limited)`);
            // For now, note that we found a Word doc but can't fully parse it
            extractedTexts.push(`\n--- WORD ATTACHMENT: ${attachment.filename} (attachment detected but content not fully extracted) ---`);
        }
    }

    return extractedTexts;
}

/**
 * POST /api/import/email
 * Webhook endpoint for receiving forwarded emails (via Resend)
 * 
 * Resend will POST email data here when someone forwards to add@cv.staycurrentai.com
 */
export async function POST(request: NextRequest) {
    try {
        // Parse the incoming email data from Resend
        const body = await request.json();

        // Process attachments if present
        let attachmentText = '';
        if (body.attachments && Array.isArray(body.attachments)) {
            console.log(`Found ${body.attachments.length} attachment(s)`);
            const extractedTexts = await processAttachments(body.attachments);
            attachmentText = extractedTexts.join('\n');
        }

        // Resend inbound email webhook format
        // https://resend.com/docs/webhooks/inbound-emails
        const emailData: EmailData = {
            from: body.from || body.envelope?.from || 'unknown',
            subject: body.subject || 'No Subject',
            textBody: (body.text || '') + attachmentText,  // Include attachment text
            htmlBody: body.html || '',
            date: body.date ? new Date(body.date) : new Date(),
        };

        console.log(`Received email from: ${emailData.from}, subject: ${emailData.subject}`);
        if (attachmentText) {
            console.log(`Attachment text extracted: ${attachmentText.length} characters`);
        }

        // Get the demo user (in a real app, you'd identify user from email address)
        const user = await getDemoUser();
        if (!user) {
            console.error('No user found for email processing');
            // Return 200 to acknowledge receipt (don't want Resend to retry)
            return NextResponse.json({
                success: false,
                error: 'No user found'
            });
        }

        // Parse the email with AI
        const entries = await parseEmailForCVEntries(emailData);

        if (entries.length === 0) {
            console.log('No CV-worthy content found in email');

            // Log activity even for no results
            await prisma.activity.create({
                data: {
                    userId: user.id,
                    type: 'email_import',
                    title: 'Email processed - no entries found',
                    description: `Subject: ${emailData.subject}`,
                    metadata: {
                        from: emailData.from,
                        subject: emailData.subject,
                        entriesFound: 0,
                        hadAttachments: Boolean(attachmentText),
                    },
                },
            });

            return NextResponse.json({
                success: true,
                message: 'Email processed, no CV-worthy content found',
                entriesCreated: 0,
            });
        }

        // Create pending entries for each parsed item
        const pendingEntries = await Promise.all(
            entries.map(async (entry) => {
                return prisma.pendingEntry.create({
                    data: {
                        userId: user.id,
                        title: entry.title,
                        description: entry.description,
                        date: entry.date,
                        location: entry.location,
                        url: entry.url,
                        sourceType: 'email',
                        sourceData: {
                            from: emailData.from,
                            subject: emailData.subject,
                            date: emailData.date.toISOString(),
                            hadAttachments: Boolean(attachmentText),
                        },
                        suggestedCategory: entry.suggestedCategory,
                        aiConfidence: entry.confidence,
                        aiReasoning: entry.reasoning,
                        status: 'pending',
                    },
                });
            })
        );

        console.log(`Created ${pendingEntries.length} pending entries from email`);

        // Log activity
        await prisma.activity.create({
            data: {
                userId: user.id,
                type: 'email_import',
                title: `${pendingEntries.length} ${pendingEntries.length === 1 ? 'entry' : 'entries'} from email`,
                description: `Subject: ${emailData.subject}${attachmentText ? ' (with attachments)' : ''}`,
                metadata: {
                    from: emailData.from,
                    subject: emailData.subject,
                    entriesFound: pendingEntries.length,
                    entryIds: pendingEntries.map(e => e.id),
                    hadAttachments: Boolean(attachmentText),
                },
            },
        });

        // Send confirmation email
        const senderEmail = extractEmail(emailData.from);
        if (senderEmail) {
            await sendEmailConfirmation(
                senderEmail,
                emailData.subject,
                entries.map(e => ({
                    title: e.title,
                    suggestedCategory: e.suggestedCategory,
                    confidence: e.confidence,
                }))
            );
        }

        return NextResponse.json({
            success: true,
            message: `Found ${entries.length} CV-worthy items`,
            entriesCreated: pendingEntries.length,
        });
    } catch (error) {
        console.error('Email processing error:', error);
        // Return 200 to prevent Resend from retrying
        return NextResponse.json({
            success: false,
            error: String(error),
        });
    }
}

// Extract email from "Name <email>" format
function extractEmail(from: string): string | null {
    const match = from.match(/<([^>]+)>/) || from.match(/([^\s<]+@[^\s>]+)/);
    return match ? match[1] : from.includes('@') ? from : null;
}

/**
 * GET /api/import/email
 * Simple endpoint to verify the webhook is accessible
 */
export async function GET() {
    return NextResponse.json({
        status: 'ok',
        message: 'Email import webhook is active. Forward emails to add@cv.staycurrentai.com',
        supportedAttachments: ['PDF (.pdf)'],
    });
}
