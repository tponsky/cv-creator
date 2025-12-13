import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
    const count = await prisma.user.count();
    return NextResponse.json({ status: 'register GET OK', userCount: count });
}

export async function POST() {
    return NextResponse.json({ status: 'register POST OK with prisma import' });
}
