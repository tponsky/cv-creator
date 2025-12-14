import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// Force dynamic rendering - don't prerender at build time
export const dynamic = 'force-dynamic';

// Get first user (demo mode - no auth)
async function getDemoUser() {
    return await prisma.user.findFirst();
}

/**
 * GET /api/pending
 * Fetch all pending entries for the current user
 */
export async function GET() {
    const user = await getDemoUser();
    if (!user) {
        return NextResponse.json({ error: 'No user found' }, { status: 404 });
    }

    const pendingEntries = await prisma.pendingEntry.findMany({
        where: {
            userId: user.id,
            status: 'pending',
        },
        orderBy: { createdAt: 'desc' },
        select: {
            id: true,
            title: true,
            description: true,
            date: true,
            url: true,
            sourceType: true,
            suggestedCategory: true,
        },
    });

    // Serialize dates for JSON response
    const entries = pendingEntries.map(e => ({
        ...e,
        date: e.date ? e.date.toISOString() : null,
    }));

    return NextResponse.json({ entries });
}
