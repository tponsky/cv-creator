import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

// GET a single entry
export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const entry = await prisma.entry.findFirst({
        where: {
            id: params.id,
            category: {
                cv: { userId: session.user.id },
            },
        },
        include: {
            category: {
                select: { id: true, name: true },
            },
        },
    });

    if (!entry) {
        return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    }

    return NextResponse.json(entry);
}

// PATCH update an entry
export async function PATCH(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { title, description, date, endDate, location, url, categoryId, displayOrder } = await request.json();

    // Verify ownership
    const entry = await prisma.entry.findFirst({
        where: {
            id: params.id,
            category: {
                cv: { userId: session.user.id },
            },
        },
    });

    if (!entry) {
        return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    }

    // If moving to a different category, verify ownership of new category
    if (categoryId && categoryId !== entry.categoryId) {
        const newCategory = await prisma.category.findFirst({
            where: {
                id: categoryId,
                cv: { userId: session.user.id },
            },
        });

        if (!newCategory) {
            return NextResponse.json({ error: 'New category not found' }, { status: 404 });
        }
    }

    const updatedEntry = await prisma.entry.update({
        where: { id: params.id },
        data: {
            ...(title && { title }),
            ...(description !== undefined && { description }),
            ...(date !== undefined && { date: date ? new Date(date) : null }),
            ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
            ...(location !== undefined && { location }),
            ...(url !== undefined && { url }),
            ...(categoryId && { categoryId }),
            ...(displayOrder !== undefined && { displayOrder }),
        },
    });

    return NextResponse.json(updatedEntry);
}

// DELETE an entry
export async function DELETE(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify ownership
    const entry = await prisma.entry.findFirst({
        where: {
            id: params.id,
            category: {
                cv: { userId: session.user.id },
            },
        },
    });

    if (!entry) {
        return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    }

    await prisma.entry.delete({
        where: { id: params.id },
    });

    return NextResponse.json({ success: true });
}
