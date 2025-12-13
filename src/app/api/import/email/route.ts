import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { parseEmailForCVEntries, EmailData } from '@/lib/email-parser';

// Get first user (demo mode - no auth)
async function getDemoUser() {
    return await prisma.user.findFirst();
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

        // Resend inbound email webhook format
        // https://resend.com/docs/webhooks/inbound-emails
        const emailData: EmailData = {
            from: body.from || body.envelope?.from || 'unknown',
            subject: body.subject || 'No Subject',
            textBody: body.text || '',
            htmlBody: body.html || '',
            date: body.date ? new Date(body.date) : new Date(),
        };

        console.log(`Received email from: ${emailData.from}, subject: ${emailData.subject}`);

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

/**
 * GET /api/import/email
 * Simple endpoint to verify the webhook is accessible
 */
export async function GET() {
    return NextResponse.json({
        status: 'ok',
        message: 'Email import webhook is active. Forward emails to add@cv.staycurrentai.com',
    });
}
