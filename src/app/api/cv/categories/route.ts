import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// Get first user (demo mode - no auth)
async function getDemoUser() {
    return await prisma.user.findFirst();
}

// GET all categories for user's CV
export async function GET() {
    const user = await getDemoUser();
    if (!user) {
        return NextResponse.json({ error: 'No user found', categories: [] }, { status: 404 });
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
    const user = await getDemoUser();
    if (!user) {
        return NextResponse.json({ error: 'No user found' }, { status: 404 });
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
