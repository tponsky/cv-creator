import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

/**
 * POST /api/pending/approve-all
 * Approve all pending entries for the current user
 */
export async function POST() {
    try {
        // Get the first user (demo mode)
        const user = await prisma.user.findFirst();
        if (!user) {
            return NextResponse.json(
                { error: 'No user found' },
                { status: 404 }
            );
        }

        // Get CV
        const cv = await prisma.cV.findUnique({
            where: { userId: user.id },
        });

        if (!cv) {
            return NextResponse.json(
                { error: 'No CV found' },
                { status: 404 }
            );
        }

        // Get all pending entries
        const pendingEntries = await prisma.pendingEntry.findMany({
            where: {
                userId: user.id,
                status: 'pending',
            },
        });

        if (pendingEntries.length === 0) {
            return NextResponse.json({
                success: true,
                message: 'No pending entries to approve',
                approved: 0,
            });
        }

        let approved = 0;
        const categoryCache: Record<string, string> = {};

        for (const entry of pendingEntries) {
            try {
                // Find or create category
                const categoryName = entry.suggestedCategory || 'Uncategorized';
                let categoryId = categoryCache[categoryName];

                if (!categoryId) {
                    let category = await prisma.category.findFirst({
                        where: {
                            cvId: cv.id,
                            name: { equals: categoryName, mode: 'insensitive' },
                        },
                    });

                    if (!category) {
                        const maxOrder = await prisma.category.findFirst({
                            where: { cvId: cv.id },
                            orderBy: { displayOrder: 'desc' },
                            select: { displayOrder: true },
                        });

                        category = await prisma.category.create({
                            data: {
                                cvId: cv.id,
                                name: categoryName,
                                displayOrder: (maxOrder?.displayOrder ?? -1) + 1,
                            },
                        });
                    }
                    categoryId = category.id;
                    categoryCache[categoryName] = categoryId;
                }

                // Get max display order for entries in this category
                const maxEntryOrder = await prisma.entry.findFirst({
                    where: { categoryId },
                    orderBy: { displayOrder: 'desc' },
                    select: { displayOrder: true },
                });

                // Create the entry
                await prisma.entry.create({
                    data: {
                        categoryId,
                        title: entry.title,
                        description: entry.description,
                        date: entry.date,
                        location: entry.location,
                        url: entry.url,
                        displayOrder: (maxEntryOrder?.displayOrder ?? -1) + 1,
                        sourceData: entry.sourceData as object | undefined,
                    },
                });

                // Delete the pending entry
                await prisma.pendingEntry.delete({
                    where: { id: entry.id },
                });

                approved++;
            } catch (error) {
                console.error(`Error approving entry ${entry.id}:`, error);
                // Continue with other entries
            }
        }

        return NextResponse.json({
            success: true,
            message: `Approved ${approved} entries`,
            approved,
            total: pendingEntries.length,
        });
    } catch (error) {
        console.error('Approve all error:', error);
        return NextResponse.json(
            { error: String(error) },
            { status: 500 }
        );
    }
}
