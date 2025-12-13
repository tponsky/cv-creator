import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { hashSync } from 'bcryptjs';

export async function GET() {
    const count = await prisma.user.count();
    return NextResponse.json({ status: 'register GET OK', userCount: count });
}

export async function POST() {
    const hash = hashSync('test', 10);
    return NextResponse.json({ status: 'register POST OK', hashStart: hash.substring(0, 10) });
}
