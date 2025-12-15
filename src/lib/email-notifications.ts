/**
 * Email Notification Service
 * Sends confirmation emails when CV entries are created
 */

import { Resend } from 'resend';

// Lazy initialize Resend client
let resendClient: Resend | null = null;

function getResend(): Resend | null {
    if (!process.env.RESEND_API_KEY) {
        return null;
    }
    if (!resendClient) {
        resendClient = new Resend(process.env.RESEND_API_KEY);
    }
    return resendClient;
}

interface EntryNotification {
    title: string;
    suggestedCategory: string | null;
    confidence: number | null;
}

/**
 * Send confirmation email when entries are created from forwarded email
 */
export async function sendEmailConfirmation(
    toEmail: string,
    originalSubject: string,
    entries: EntryNotification[]
): Promise<boolean> {
    if (!process.env.RESEND_API_KEY) {
        console.log('RESEND_API_KEY not set, skipping confirmation email');
        return false;
    }

    try {
        const entryList = entries.map(e =>
            `• <strong>${e.title}</strong> → ${e.suggestedCategory || 'Uncategorized'}`
        ).join('<br>');

        const html = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; }
        .entry-list { background: white; padding: 15px; border-radius: 6px; margin: 15px 0; }
        .cta-button { display: inline-block; background: #667eea; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; margin-top: 15px; }
        .footer { color: #6b7280; font-size: 12px; margin-top: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2 style="margin: 0;">✅ Your email was processed!</h2>
        </div>
        <div class="content">
            <p>We received your forwarded email and found <strong>${entries.length}</strong> CV-worthy ${entries.length === 1 ? 'entry' : 'entries'}:</p>
            
            <div class="entry-list">
                ${entryList}
            </div>
            
            <p><strong>Original email:</strong> ${originalSubject}</p>
            
            <p>These entries are now pending your review. You can approve, edit, or reject them:</p>
            
            <a href="https://cv.staycurrentai.com/cv/review" class="cta-button">
                Review Pending Entries →
            </a>
            
            <p class="footer">
                You received this email because you forwarded an email to add@cv.staycurrentai.com
            </p>
        </div>
    </div>
</body>
</html>
        `;

        const resend = getResend();
        if (!resend) return false;

        await resend.emails.send({
            from: 'CV Creator <noreply@cv.staycurrentai.com>',
            to: toEmail,
            subject: `✅ CV Updated: ${entries.length} new ${entries.length === 1 ? 'entry' : 'entries'} from your email`,
            html,
        });

        console.log(`Confirmation email sent to ${toEmail}`);
        return true;
    } catch (error) {
        console.error('Failed to send confirmation email:', error);
        return false;
    }
}

/**
 * Send notification about new PubMed publications found
 */
export async function sendPubMedNotification(
    toEmail: string,
    count: number
): Promise<boolean> {
    if (!process.env.RESEND_API_KEY) {
        console.log('RESEND_API_KEY not set, skipping PubMed notification');
        return false;
    }

    try {
        const html = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; }
        .cta-button { display: inline-block; background: #10b981; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; margin-top: 15px; }
        .footer { color: #6b7280; font-size: 12px; margin-top: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2 style="margin: 0;">📚 New Publications Found!</h2>
        </div>
        <div class="content">
            <p>We found <strong>${count}</strong> new ${count === 1 ? 'publication' : 'publications'} on PubMed that we haven't seen before.</p>
            
            <p>These have been added to your pending review queue.</p>
            
            <a href="https://cv.staycurrentai.com/cv/review" class="cta-button">
                Review New Publications →
            </a>
            
            <p class="footer">
                You received this email because you have PubMed auto-updates enabled.
            </p>
        </div>
    </div>
</body>
</html>
        `;

        const resend = getResend();
        if (!resend) return false;

        await resend.emails.send({
            from: 'CV Creator <noreply@cv.staycurrentai.com>',
            to: toEmail,
            subject: `📚 ${count} new publication${count === 1 ? '' : 's'} found on PubMed`,
            html,
        });

        console.log(`PubMed notification email sent to ${toEmail}`);
        return true;
    } catch (error) {
        console.error('Failed to send PubMed notification:', error);
        return false;
    }
}
