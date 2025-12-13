import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { hashSync } from 'bcryptjs';
import { createToken } from '@/lib/jwt';

export async function GET() {
    const count = await prisma.user.count();
    return NextResponse.json({ status: 'register GET OK with jwt import', userCount: count });
}

export async function POST() {
    const hash = hashSync('test', 10);
    const token = await createToken({ id: 'test', email: 'test@test.com' });
    return NextResponse.json({ status: 'register POST OK', hashStart: hash.substring(0, 10), tokenStart: token.substring(0, 20) });
}
