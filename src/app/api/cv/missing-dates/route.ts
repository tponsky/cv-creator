import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getUserFromRequest } from '@/lib/server-auth';

/**
 * GET /api/cv/missing-dates
 * Get all entries that are missing dates
 */
export async function GET(request: NextRequest) {
    const user = await getUserFromRequest(request);
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const cv = await prisma.cV.findUnique({
            where: { userId: user.id },
            include: {
                categories: {
                    include: {
                        entries: {
                            where: { date: null },
                            orderBy: { displayOrder: 'asc' },
                            select: {
                                id: true,
                                title: true,
                                description: true,
                            },
                        },
                    },
                },
            },
        });

        if (!cv) {
            return NextResponse.json({ entries: [], total: 0 });
        }

        // Flatten entries with category info
        const entries = cv.categories.flatMap(cat =>
            cat.entries.map(entry => ({
                ...entry,
                categoryId: cat.id,
                categoryName: cat.name,
            }))
        );

        return NextResponse.json({
            entries,
            total: entries.length,
        });
    } catch (error) {
        console.error('Missing dates API error:', error);
        return NextResponse.json({ error: 'Failed to fetch entries' }, { status: 500 });
    }
}

/**
 * POST /api/cv/missing-dates
 * Update date for an entry
 */
export async function POST(request: NextRequest) {
    const user = await getUserFromRequest(request);
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { entryId, date } = await request.json();

        if (!entryId) {
            return NextResponse.json({ error: 'entryId is required' }, { status: 400 });
        }

        // Verify ownership
        const entry = await prisma.entry.findFirst({
            where: {
                id: entryId,
                category: { cv: { userId: user.id } },
            },
        });

        if (!entry) {
            return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
        }

        // Update the date
        const updated = await prisma.entry.update({
            where: { id: entryId },
            data: { date: date ? new Date(date) : null },
        });

        return NextResponse.json({ success: true, entry: updated });
    } catch (error) {
        console.error('Update date error:', error);
        return NextResponse.json({ error: 'Failed to update date' }, { status: 500 });
    }
}
