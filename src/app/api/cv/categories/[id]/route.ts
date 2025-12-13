import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// Get first user (demo mode - no auth)
async function getDemoUser() {
    return await prisma.user.findFirst();
}

// PATCH update a category
export async function PATCH(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const user = await getDemoUser();
    if (!user) {
        return NextResponse.json({ error: 'No user found' }, { status: 404 });
    }

    const { name, displayOrder } = await request.json();
    const categoryId = params.id;

    // Verify ownership
    const category = await prisma.category.findFirst({
        where: {
            id: categoryId,
            cv: { userId: user.id },
        },
    });

    if (!category) {
        return NextResponse.json({ error: 'Category not found' }, { status: 404 });
    }

    const updatedCategory = await prisma.category.update({
        where: { id: categoryId },
        data: {
            ...(name && { name }),
            ...(displayOrder !== undefined && { displayOrder }),
        },
    });

    return NextResponse.json(updatedCategory);
}

// DELETE a category
export async function DELETE(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const user = await getDemoUser();
    if (!user) {
        return NextResponse.json({ error: 'No user found' }, { status: 404 });
    }

    const categoryId = params.id;

    // Verify ownership
    const category = await prisma.category.findFirst({
        where: {
            id: categoryId,
            cv: { userId: user.id },
        },
    });

    if (!category) {
        return NextResponse.json({ error: 'Category not found' }, { status: 404 });
    }

    // Delete category (entries will cascade delete)
    await prisma.category.delete({
        where: { id: categoryId },
    });

    return NextResponse.json({ success: true });
}
