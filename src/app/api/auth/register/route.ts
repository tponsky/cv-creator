import { NextRequest, NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import prisma from '@/lib/prisma';
import { createToken, AUTH_COOKIE_OPTIONS } from '@/lib/jwt';

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

        // Create user (simplified - without nested creates)
        const user = await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
                institution,
            },
        });

        // Create CV and categories in separate operations
        const cv = await prisma.cV.create({
            data: {
                userId: user.id,
                title: 'Curriculum Vitae',
            },
        });

        // Create default categories
        await prisma.category.createMany({
            data: [
                { cvId: cv.id, name: 'Education', displayOrder: 0 },
                { cvId: cv.id, name: 'Academic Positions', displayOrder: 1 },
                { cvId: cv.id, name: 'Peer-Reviewed Publications', displayOrder: 2 },
                { cvId: cv.id, name: 'Book Chapters', displayOrder: 3 },
                { cvId: cv.id, name: 'Presentations', displayOrder: 4 },
                { cvId: cv.id, name: 'Grants & Funding', displayOrder: 5 },
                { cvId: cv.id, name: 'Awards & Honors', displayOrder: 6 },
                { cvId: cv.id, name: 'Teaching', displayOrder: 7 },
                { cvId: cv.id, name: 'Mentorship', displayOrder: 8 },
                { cvId: cv.id, name: 'Service & Leadership', displayOrder: 9 },
                { cvId: cv.id, name: 'Professional Memberships', displayOrder: 10 },
            ],
        });

        // Create user preferences
        await prisma.userPreferences.create({
            data: {
                userId: user.id,
                bioStyle: 'professional',
                bioLength: 250,
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
