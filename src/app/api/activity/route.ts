import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

// Get first user (demo mode - no auth)
async function getDemoUser() {
    return await prisma.user.findFirst();
}

/**
 * GET /api/activity
 * Get recent activity for the current user
 */
export async function GET() {
    try {
        const user = await getDemoUser();
        if (!user) {
            return NextResponse.json({ activities: [] });
        }

        // Get recent activities
        const activities = await prisma.activity.findMany({
            where: { userId: user.id },
            orderBy: { createdAt: 'desc' },
            take: 20,
        });

        // Get pending entry count
        const pendingCount = await prisma.pendingEntry.count({
            where: {
                userId: user.id,
                status: 'pending',
            },
        });

        return NextResponse.json({
            activities: activities.map(a => ({
                id: a.id,
                type: a.type,
                title: a.title,
                description: a.description,
                read: a.read,
                createdAt: a.createdAt.toISOString(),
            })),
            pendingCount,
        });
    } catch (error) {
        console.error('Activity API error:', error);
        return NextResponse.json(
            { error: String(error), activities: [], pendingCount: 0 },
            { status: 500 }
        );
    }
}

/**
 * POST /api/activity/mark-read
 * Mark all activities as read
 */
export async function POST() {
    try {
        const user = await getDemoUser();
        if (!user) {
            return NextResponse.json({ success: false });
        }

        await prisma.activity.updateMany({
            where: { userId: user.id, read: false },
            data: { read: true },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Mark read error:', error);
        return NextResponse.json({ success: false }, { status: 500 });
    }
}
