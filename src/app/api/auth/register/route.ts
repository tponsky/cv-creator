import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ status: 'register GET OK' });
}

export async function POST() {
    return NextResponse.json({ status: 'register POST OK' });
}
