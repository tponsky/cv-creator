import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getUserFromRequest } from '@/lib/server-auth';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

/**
 * GET /api/entries/recent
 * Fetch recent entries for the current authenticated user
 */
export async function GET(request: NextRequest) {
    const user = await getUserFromRequest(request);
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized', entries: [] }, { status: 401 });
    }

    // Get user's CV with recent entries
    const cv = await prisma.cV.findUnique({
        where: { userId: user.id },
        include: {
            categories: {
                include: {
                    entries: {
                        orderBy: { createdAt: 'desc' },
                        take: 10,
                        select: {
                            id: true,
                            title: true,
                            createdAt: true,
                        },
                    },
                },
            },
        },
    });

    if (!cv) {
        return NextResponse.json({ entries: [] });
    }

    // Flatten entries and add category name
    const entries = cv.categories.flatMap(cat =>
        cat.entries.map(entry => ({
            id: entry.id,
            title: entry.title,
            categoryName: cat.name,
            createdAt: entry.createdAt.toISOString(),
        }))
    );

    // Sort by createdAt and take top 10
    entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({ entries: entries.slice(0, 10) });
}
