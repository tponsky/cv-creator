import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// Get first user (demo mode - no auth)
async function getDemoUser() {
    return await prisma.user.findFirst();
}

// GET all entries (optionally filtered by category)
export async function GET(request: NextRequest) {
    const user = await getDemoUser();
    if (!user) {
        return NextResponse.json({ error: 'No user found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get('categoryId');

    const cv = await prisma.cV.findUnique({
        where: { userId: user.id },
        include: {
            categories: {
                where: categoryId ? { id: categoryId } : undefined,
                include: {
                    entries: {
                        orderBy: [{ date: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
                    },
                },
            },
        },
    });

    const entries = cv?.categories.flatMap((cat) => cat.entries) || [];
    return NextResponse.json(entries);
}

// POST create a new entry
export async function POST(request: NextRequest) {
    const user = await getDemoUser();
    if (!user) {
        return NextResponse.json({ error: 'No user found' }, { status: 404 });
    }

    const { categoryId, title, description, date, endDate, location, url, sourceType, sourceData } = await request.json();

    if (!categoryId || !title) {
        return NextResponse.json({ error: 'categoryId and title are required' }, { status: 400 });
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

    // Get current max displayOrder
    const maxOrder = await prisma.entry.findFirst({
        where: { categoryId },
        orderBy: { displayOrder: 'desc' },
        select: { displayOrder: true },
    });

    const entry = await prisma.entry.create({
        data: {
            categoryId,
            title,
            description,
            date: date ? new Date(date) : null,
            endDate: endDate ? new Date(endDate) : null,
            location,
            url,
            sourceType: sourceType || 'manual',
            sourceData,
            displayOrder: (maxOrder?.displayOrder ?? -1) + 1,
        },
    });

    return NextResponse.json(entry, { status: 201 });
}
