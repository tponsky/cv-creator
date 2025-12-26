import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getUserFromRequest } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/user/balance
 * Get user's current balance and usage stats
 */
export async function GET(request: NextRequest) {
    try {
        const user = await getUserFromRequest(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const dbUser = await prisma.user.findUnique({
            where: { id: user.id },
            select: { balanceUsd: true },
        });

        if (!dbUser) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Get total spent
        const totalSpent = await prisma.usage.aggregate({
            where: { 
                userId: user.id,
                action: { not: 'deposit' },
            },
            _sum: { costUsd: true },
        });

        // Get recent usage (last 10)
        const recentUsage = await prisma.usage.findMany({
            where: { userId: user.id },
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: {
                id: true,
                action: true,
                costUsd: true,
                details: true,
                createdAt: true,
            },
        });

        return NextResponse.json({
            balanceUsd: dbUser.balanceUsd || 0,
            totalSpent: totalSpent._sum.costUsd || 0,
            needsReload: (dbUser.balanceUsd || 0) < 0.50,
            recentUsage,
        });

    } catch (error) {
        console.error('[Balance API] Error:', error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}

