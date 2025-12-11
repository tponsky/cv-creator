import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

// GET all categories for user's CV
export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const cv = await prisma.cV.findUnique({
        where: { userId: session.user.id },
        include: {
            categories: {
                orderBy: { displayOrder: 'asc' },
            },
        },
    });

    return NextResponse.json(cv?.categories || []);
}

// POST create a new category
export async function POST(request: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
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
