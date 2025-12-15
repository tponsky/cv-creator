import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/server-auth';
import prisma from '@/lib/prisma';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

/**
 * GET /api/user/profile - Get current user's profile
 */
export async function GET(request: NextRequest) {
    try {
        const authUser = await getUserFromRequest(request);

        if (!authUser) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const user = await prisma.user.findUnique({
            where: { id: authUser.id },
            select: {
                id: true,
                email: true,
                name: true,
                institution: true,
                phone: true,
                address: true,
                website: true,
            },
        });

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        return NextResponse.json({ user });
    } catch (error) {
        console.error('Get profile error:', error);
        return NextResponse.json({ error: 'Failed to get profile' }, { status: 500 });
    }
}

/**
 * PUT /api/user/profile - Update current user's profile
 */
export async function PUT(request: NextRequest) {
    try {
        const authUser = await getUserFromRequest(request);

        if (!authUser) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { name, institution, phone, address, website } = body;

        const updatedUser = await prisma.user.update({
            where: { id: authUser.id },
            data: {
                name: name || undefined,
                institution: institution || null,
                phone: phone || null,
                address: address || null,
                website: website || null,
            },
            select: {
                id: true,
                email: true,
                name: true,
                institution: true,
                phone: true,
                address: true,
                website: true,
            },
        });

        return NextResponse.json({
            success: true,
            message: 'Profile updated successfully',
            user: updatedUser
        });
    } catch (error) {
        console.error('Update profile error:', error);
        return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
    }
}
