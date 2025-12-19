import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getUserFromRequest } from '@/lib/server-auth';

/**
 * DELETE /api/cv/reset
 * Delete all CV data for the current user (categories, entries, pending entries)
 */
export async function DELETE(request: NextRequest) {
    const user = await getUserFromRequest(request);
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Get the user's CV
        const cv = await prisma.cV.findUnique({
            where: { userId: user.id },
            include: {
                categories: {
                    include: { entries: true },
                },
            },
        });

        if (!cv) {
            return NextResponse.json({
                success: true,
                message: 'No CV data found to delete',
                deleted: { categories: 0, entries: 0, pendingEntries: 0 }
            });
        }

        // Count for reporting
        const categoryCount = cv.categories.length;
        const entryCount = cv.categories.reduce((sum, cat) => sum + cat.entries.length, 0);

        // Delete all entries first (due to foreign key constraints)
        await prisma.entry.deleteMany({
            where: {
                category: { cvId: cv.id },
            },
        });

        // Delete all categories
        await prisma.category.deleteMany({
            where: { cvId: cv.id },
        });

        // Delete pending entries for this user
        const pendingResult = await prisma.pendingEntry.deleteMany({
            where: { userId: user.id },
        });

        // Optionally delete the CV itself (or keep it as an empty container)
        // await prisma.cV.delete({ where: { id: cv.id } });

        return NextResponse.json({
            success: true,
            message: `Deleted ${categoryCount} categories with ${entryCount} entries`,
            deleted: {
                categories: categoryCount,
                entries: entryCount,
                pendingEntries: pendingResult.count,
            },
        });
    } catch (error) {
        console.error('CV reset error:', error);
        return NextResponse.json({ error: 'Failed to delete CV data' }, { status: 500 });
    }
}
