import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

// PATCH update a category
export async function PATCH(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name, displayOrder } = await request.json();
    const categoryId = params.id;

    // Verify ownership
    const category = await prisma.category.findFirst({
        where: {
            id: categoryId,
            cv: { userId: session.user.id },
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
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const categoryId = params.id;

    // Verify ownership
    const category = await prisma.category.findFirst({
        where: {
            id: categoryId,
            cv: { userId: session.user.id },
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
