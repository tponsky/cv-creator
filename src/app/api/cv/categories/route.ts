import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getUserFromRequest } from '@/lib/server-auth';

// GET all categories for user's CV
export async function GET(request: NextRequest) {
    const user = await getUserFromRequest(request);
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized', categories: [] }, { status: 401 });
    }

    const cv = await prisma.cV.findUnique({
        where: { userId: user.id },
        include: {
            categories: {
                orderBy: { displayOrder: 'asc' },
            },
        },
    });

    return NextResponse.json({ categories: cv?.categories || [] });
}

// POST create a new category
export async function POST(request: NextRequest) {
    const user = await getUserFromRequest(request);
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name, cvId } = await request.json();

    if (!name || !cvId) {
        return NextResponse.json({ error: 'Name and cvId are required' }, { status: 400 });
    }

    // Get current max displayOrder
    const maxOrder = await prisma.category.findFirst({
        where: { cvId },
        orderBy: { displayOrder: 'desc' },
        select: { displayOrder: true },
    });

    const category = await prisma.category.create({
        data: {
            name,
            cvId,
            displayOrder: (maxOrder?.displayOrder ?? -1) + 1,
        },
    });

    return NextResponse.json(category, { status: 201 });
}
