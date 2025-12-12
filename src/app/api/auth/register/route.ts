import { NextRequest, NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import prisma from '@/lib/prisma';
import { createToken, AUTH_COOKIE_OPTIONS } from '@/lib/jwt';

// Default CV categories for academic CVs
const DEFAULT_CATEGORIES = [
    { name: 'Education', displayOrder: 0 },
    { name: 'Academic Positions', displayOrder: 1 },
    { name: 'Peer-Reviewed Publications', displayOrder: 2 },
    { name: 'Book Chapters', displayOrder: 3 },
    { name: 'Presentations', displayOrder: 4 },
    { name: 'Grants & Funding', displayOrder: 5 },
    { name: 'Awards & Honors', displayOrder: 6 },
    { name: 'Teaching', displayOrder: 7 },
    { name: 'Mentorship', displayOrder: 8 },
    { name: 'Service & Leadership', displayOrder: 9 },
    { name: 'Professional Memberships', displayOrder: 10 },
];

export async function POST(request: NextRequest) {
    try {
        const { name, email, password, institution } = await request.json();

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

        // Hash password
        const hashedPassword = await hash(password, 12);

        // Create user with CV and default categories
        const user = await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
                institution,
                cv: {
                    create: {
                        title: 'Curriculum Vitae',
                        categories: {
                            create: DEFAULT_CATEGORIES,
                        },
                    },
                },
                preferences: {
                    create: {
                        bioStyle: 'professional',
                        bioLength: 250,
                    },
                },
            },
            include: {
                cv: {
                    include: {
                        categories: true,
                    },
                },
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
                token, // Also return token for localStorage option
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
