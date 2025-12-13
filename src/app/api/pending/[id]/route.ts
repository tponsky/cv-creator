import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// Get first user (demo mode - no auth)
async function getDemoUser() {
    return await prisma.user.findFirst();
}

/**
 * DELETE /api/pending/[id]
 * Reject (delete) a pending entry
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const user = await getDemoUser();
    if (!user) {
        return NextResponse.json({ error: 'No user found' }, { status: 404 });
    }

    const entryId = params.id;

    // Verify ownership
    const entry = await prisma.pendingEntry.findFirst({
        where: {
            id: entryId,
            userId: user.id,
        },
    });

    if (!entry) {
        return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    }

    // Delete the pending entry
    await prisma.pendingEntry.delete({
        where: { id: entryId },
    });

    return NextResponse.json({ success: true });
}
