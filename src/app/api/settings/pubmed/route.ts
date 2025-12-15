import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

// Get first user (demo mode - no auth)
async function getDemoUser() {
    return await prisma.user.findFirst();
}

/**
 * GET /api/settings/pubmed
 * Get PubMed auto-update settings
 */
export async function GET() {
    try {
        const user = await getDemoUser();
        if (!user) {
            return NextResponse.json({ error: 'No user found' }, { status: 404 });
        }

        // Get or create preferences
        let prefs = await prisma.userPreferences.findUnique({
            where: { userId: user.id },
        });

        if (!prefs) {
            prefs = await prisma.userPreferences.create({
                data: { userId: user.id },
            });
        }

        return NextResponse.json({
            enabled: prefs.pubmedEnabled,
            authorName: prefs.pubmedAuthorName || '',
            frequency: prefs.pubmedFrequency,
            notifyEmail: prefs.pubmedNotifyEmail,
            lastChecked: prefs.pubmedLastChecked?.toISOString() || null,
        });
    } catch (error) {
        console.error('PubMed settings GET error:', error);
        return NextResponse.json(
            { error: String(error) },
            { status: 500 }
        );
    }
}

/**
 * POST /api/settings/pubmed
 * Update PubMed auto-update settings
 */
export async function POST(request: NextRequest) {
    try {
        const user = await getDemoUser();
        if (!user) {
            return NextResponse.json({ error: 'No user found' }, { status: 404 });
        }

        const body = await request.json();
        const { enabled, authorName, frequency, notifyEmail } = body;

        // Validate frequency
        const validFrequencies = ['daily', 'weekly', 'monthly'];
        const safeFrequency = validFrequencies.includes(frequency) ? frequency : 'weekly';

        // Upsert preferences
        const prefs = await prisma.userPreferences.upsert({
            where: { userId: user.id },
            update: {
                pubmedEnabled: Boolean(enabled),
                pubmedAuthorName: authorName || null,
                pubmedFrequency: safeFrequency,
                pubmedNotifyEmail: Boolean(notifyEmail),
            },
            create: {
                userId: user.id,
                pubmedEnabled: Boolean(enabled),
                pubmedAuthorName: authorName || null,
                pubmedFrequency: safeFrequency,
                pubmedNotifyEmail: Boolean(notifyEmail),
            },
        });

        // If enabling for the first time with an author name, trigger initial check
        if (enabled && authorName && !prefs.pubmedLastChecked) {
            // Queue initial check (could be deferred to cron)
            console.log(`PubMed auto-update enabled for: ${authorName}`);
        }

        return NextResponse.json({
            success: true,
            enabled: prefs.pubmedEnabled,
            authorName: prefs.pubmedAuthorName,
            frequency: prefs.pubmedFrequency,
            notifyEmail: prefs.pubmedNotifyEmail,
        });
    } catch (error) {
        console.error('PubMed settings POST error:', error);
        return NextResponse.json(
            { error: String(error) },
            { status: 500 }
        );
    }
}
