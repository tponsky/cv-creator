import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getUserFromRequest } from '@/lib/server-auth';

// Force dynamic rendering - don't prerender at build time
export const dynamic = 'force-dynamic';

/**
 * GET /api/pending
 * Fetch all pending entries for the current authenticated user
 */
export async function GET(request: NextRequest) {
    const user = await getUserFromRequest(request);
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
    const entries = pendingEntries.map((e: typeof pendingEntries[number]) => ({
        ...e,
        date: e.date ? e.date.toISOString() : null,
    }));

    return NextResponse.json({ entries });
}
