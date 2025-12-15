import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getUserFromRequest } from '@/lib/server-auth';

/**
 * POST /api/pending/[id]/approve
 * Approve a pending entry and add it to the CV
 */
export async function POST(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const user = await getUserFromRequest(request);
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const entryId = params.id;
    const { categoryId } = await request.json();

    if (!categoryId) {
        return NextResponse.json(
            { error: 'categoryId is required' },
            { status: 400 }
        );
    }

    // Verify ownership of pending entry
    const pendingEntry = await prisma.pendingEntry.findFirst({
        where: {
            id: entryId,
            userId: user.id,
        },
    });

    if (!pendingEntry) {
        return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    }

    // Verify ownership of category
    const category = await prisma.category.findFirst({
        where: {
            id: categoryId,
            cv: { userId: user.id },
        },
    });

    if (!category) {
        return NextResponse.json({ error: 'Category not found' }, { status: 404 });
    }

    // Get current max displayOrder for the category
    const maxOrder = await prisma.entry.findFirst({
        where: { categoryId },
        orderBy: { displayOrder: 'desc' },
        select: { displayOrder: true },
    });

    // Create the CV entry
    const entry = await prisma.entry.create({
        data: {
            categoryId,
            title: pendingEntry.title,
            description: pendingEntry.description,
            date: pendingEntry.date,
            startDate: pendingEntry.startDate,
            endDate: pendingEntry.endDate,
            location: pendingEntry.location,
            url: pendingEntry.url,
            sourceType: pendingEntry.sourceType || 'import',
            sourceData: pendingEntry.sourceData as object | undefined,
            displayOrder: (maxOrder?.displayOrder ?? -1) + 1,
        },
    });

    // Mark pending entry as approved (or delete it)
    await prisma.pendingEntry.update({
        where: { id: entryId },
        data: { status: 'approved' },
    });

    // Optionally delete approved entries to keep table clean
    await prisma.pendingEntry.delete({
        where: { id: entryId },
    });

    return NextResponse.json({
        success: true,
        entry,
    });
}
