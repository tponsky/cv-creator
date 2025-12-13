import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { hashSync } from 'bcryptjs';
import { createToken, AUTH_COOKIE_OPTIONS } from '@/lib/jwt';

export async function GET() {
    const count = await prisma.user.count();
    return NextResponse.json({ status: 'register endpoint ready', userCount: count });
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { name, email, password, institution } = body;

        // Validation
        if (!email || !password) {
            return NextResponse.json(
                { error: 'Email and password are required' },
                { status: 400 }
            );
        }

        if (password.length < 8) {
            return NextResponse.json(
                { error: 'Password must be at least 8 characters' },
                { status: 400 }
            );
        }

        // Check if user already exists
        const existingUser = await prisma.user.findUnique({
            where: { email },
        });

        if (existingUser) {
            return NextResponse.json(
                { error: 'An account with this email already exists' },
                { status: 400 }
            );
        }

        // Hash password (sync version avoids async bundling issues)
        const hashedPassword = hashSync(password, 10);

        // Create user
        const user = await prisma.user.create({
            data: {
                name: name || null,
                email,
                password: hashedPassword,
                institution: institution || null,
            },
        });

        // Create JWT token for auto-login
        const token = await createToken({
            id: user.id,
            email: user.email,
            name: user.name || undefined,
        });

        // Create response with cookie (auto-login)
        const response = NextResponse.json(
            {
                message: 'Account created successfully',
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                },
                token,
            },
            { status: 201 }
        );

        // Set auth cookie for auto-login
        response.cookies.set('auth-token', token, AUTH_COOKIE_OPTIONS);

        return response;
    } catch (error) {
        console.error('Registration error:', error);
        return NextResponse.json(
            { error: 'An error occurred during registration' },
            { status: 500 }
        );
    }
}
