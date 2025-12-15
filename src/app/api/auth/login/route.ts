import { NextRequest, NextResponse } from 'next/server';
import { compare } from 'bcryptjs';
import { createToken, AUTH_COOKIE_OPTIONS } from '@/lib/jwt';
import prisma from '@/lib/prisma';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { email, password } = body;

        if (!email || !password) {
            return NextResponse.json(
                { error: 'Email and password are required' },
                { status: 400 }
            );
        }

        // Find user by email
        const user = await prisma.user.findUnique({
            where: { email: email.toLowerCase() },
        });

        if (!user) {
            return NextResponse.json(
                { error: 'Invalid email or password' },
                { status: 401 }
            );
        }

        // Check password
        const isPasswordValid = await compare(password, user.password);

        if (!isPasswordValid) {
            return NextResponse.json(
                { error: 'Invalid email or password' },
                { status: 401 }
            );
        }

        // Generate JWT token using jose (consistent with jwt.ts)
        const token = await createToken({
            id: user.id,
            email: user.email,
            name: user.name || undefined,
        });

        // Create response with user data
        const response = NextResponse.json({
            success: true,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
            },
            token,
        });

        // Set HTTP-only cookie for security
        response.cookies.set('auth-token', token, AUTH_COOKIE_OPTIONS);

        return response;
    } catch (error) {
        console.error('Login error:', error);
        return NextResponse.json(
            { error: 'An unexpected error occurred' },
            { status: 500 }
        );
    }
}

