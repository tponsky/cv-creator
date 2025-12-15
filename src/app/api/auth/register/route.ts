import { NextRequest, NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { createToken, AUTH_COOKIE_OPTIONS } from '@/lib/jwt';
import prisma from '@/lib/prisma';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { name, email, password, institution } = body;

        // Validation
        if (!name || !email || !password) {
            return NextResponse.json(
                { error: 'Name, email, and password are required' },
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
            where: { email: email.toLowerCase() },
        });

        if (existingUser) {
            return NextResponse.json(
                { error: 'An account with this email already exists' },
                { status: 409 }
            );
        }

        // Hash password
        const hashedPassword = await hash(password, 12);

        // Create user and initial CV in a transaction
        const user = await prisma.user.create({
            data: {
                name,
                email: email.toLowerCase(),
                password: hashedPassword,
                institution: institution || null,
                cv: {
                    create: {
                        title: `${name}'s CV`,
                        categories: {
                            create: [
                                { name: 'Education', displayOrder: 0 },
                                { name: 'Experience', displayOrder: 1 },
                                { name: 'Publications', displayOrder: 2 },
                                { name: 'Presentations', displayOrder: 3 },
                                { name: 'Awards', displayOrder: 4 },
                            ],
                        },
                    },
                },
            },
            include: {
                cv: true,
            },
        });

        // Generate JWT token using jose (consistent with jwt.ts)
        const token = await createToken({
            id: user.id,
            email: user.email,
            name: user.name || undefined,
        });

        // Create response
        const response = NextResponse.json({
            success: true,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
            },
            token,
        });

        // Set HTTP-only cookie
        response.cookies.set('auth-token', token, AUTH_COOKIE_OPTIONS);

        return response;
    } catch (error) {
        console.error('Registration error:', error);
        return NextResponse.json(
            { error: 'An unexpected error occurred' },
            { status: 500 }
        );
    }
}
