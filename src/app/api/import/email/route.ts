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

// Process attachments and extract text (currently unused - attachments need separate API calls)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
        // Parse the incoming webhook data from Resend
        const body = await request.json();

        // DEBUG: Log the full payload structure
        console.log('=== RESEND WEBHOOK PAYLOAD ===');
        console.log('Type:', body.type);
        console.log('Top-level keys:', Object.keys(body));
        if (body.data) {
            console.log('Data keys:', Object.keys(body.data));
            console.log('Email ID:', body.data.email_id);
            console.log('Subject from webhook:', body.data.subject);
            console.log('From from webhook:', body.data.from);
        }
        console.log('=== END PAYLOAD DEBUG ===');

        // Get the email_id from webhook - Resend wraps data in 'data' object
        const emailId = body.data?.email_id;
        if (!emailId) {
            console.error('No email_id in webhook payload');
            return NextResponse.json({
                success: false,
                error: 'No email_id in webhook'
            });
        }

        // Fetch the full email content via Resend API
        // The webhook only sends metadata, we need to fetch html/text body
        const RESEND_API_KEY = process.env.RESEND_API_KEY;
        if (!RESEND_API_KEY) {
            console.error('RESEND_API_KEY not configured');
            return NextResponse.json({
                success: false,
                error: 'RESEND_API_KEY not configured'
            });
        }

        console.log(`Fetching full email content for ID: ${emailId}`);
        // Use /emails/receiving/ endpoint for inbound emails
        const emailResponse = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
            headers: {
                'Authorization': `Bearer ${RESEND_API_KEY}`,
            },
        });

        if (!emailResponse.ok) {
            console.error('Failed to fetch email from Resend:', await emailResponse.text());
            return NextResponse.json({
                success: false,
                error: 'Failed to fetch email content'
            });
        }

        const fullEmail = await emailResponse.json();
        console.log('Full email fetched - Subject:', fullEmail.subject);
        console.log('HTML length:', fullEmail.html?.length || 0);
        console.log('Text length:', fullEmail.text?.length || 0);

        // Process attachments if present (need to fetch separately via API)
        const attachmentText = ''; // TODO: Fetch attachments via API
        // Note: Attachments would need to be fetched via /emails/{email_id}/attachments/{attachment_id}
        // For now, we'll use the body content

        // Build email data from the full email response
        const emailData: EmailData = {
            from: fullEmail.from || body.data?.from || 'unknown',
            subject: fullEmail.subject || 'No Subject',
            textBody: (fullEmail.text || '') + attachmentText,
            htmlBody: fullEmail.html || '',
            date: fullEmail.created_at ? new Date(fullEmail.created_at) : new Date(),
        };

        console.log(`Processing email from: ${emailData.from}, subject: ${emailData.subject}`);
        console.log(`Body preview (first 200 chars): ${(emailData.textBody || emailData.htmlBody || '').substring(0, 200)}`);

        // Get the demo user
        const user = await getDemoUser();
        if (!user) {
            console.error('No user found for email processing');
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
                        startDate: entry.startDate,
                        endDate: entry.endDate,
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
                    entryIds: pendingEntries.map((e: { id: string }) => e.id),
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
