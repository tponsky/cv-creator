import { NextResponse } from 'next/server';
import { cvQueue } from '@/lib/queue';
import { redis } from '@/lib/redis';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/import/cv/health
 * Health check endpoint to verify worker, Redis, and database connectivity
 */
export async function GET() {
    const health: {
        status: 'healthy' | 'degraded' | 'unhealthy';
        checks: Record<string, { status: 'ok' | 'error' | 'warning'; message?: string }>;
    } = {
        status: 'healthy',
        checks: {},
    };

    // Check Redis connection
    try {
        await redis.ping();
        health.checks.redis = { status: 'ok' };
    } catch (error) {
        health.checks.redis = {
            status: 'error',
            message: error instanceof Error ? error.message : String(error),
        };
        health.status = 'unhealthy';
    }

    // Check Database connection
    try {
        await prisma.$queryRaw`SELECT 1`;
        health.checks.database = { status: 'ok' };
    } catch (error) {
        health.checks.database = {
            status: 'error',
            message: error instanceof Error ? error.message : String(error),
        };
        health.status = 'unhealthy';
    }

    // Check Queue status
    try {
        const waiting = await cvQueue.getWaitingCount();
        const active = await cvQueue.getActiveCount();
        const completed = await cvQueue.getCompletedCount();
        const failed = await cvQueue.getFailedCount();

        health.checks.queue = {
            status: 'ok',
            message: `Waiting: ${waiting}, Active: ${active}, Completed: ${completed}, Failed: ${failed}`,
        };
    } catch (error) {
        health.checks.queue = {
            status: 'error',
            message: error instanceof Error ? error.message : String(error),
        };
        health.status = health.status === 'healthy' ? 'degraded' : 'unhealthy';
    }

    // Check if workers are processing (by checking active jobs - if there are active jobs, workers are likely running)
    try {
        const activeJobs = await cvQueue.getActiveCount();
        // If there are active jobs, workers are likely running
        // If there are no active jobs but there are waiting jobs, workers might not be running
        const waitingJobs = await cvQueue.getWaitingCount();
        const hasWorkers = activeJobs > 0 || waitingJobs === 0; // If no waiting jobs, workers are likely processing or idle
        
        health.checks.workers = {
            status: hasWorkers ? 'ok' : 'warning',
            message: `Active jobs: ${activeJobs}, Waiting jobs: ${waitingJobs}. ${waitingJobs > 0 && activeJobs === 0 ? 'Workers may not be running.' : 'Workers appear to be running.'}`,
        };
        if (!hasWorkers && waitingJobs > 0) {
            health.status = health.status === 'healthy' ? 'degraded' : 'unhealthy';
        }
    } catch (error) {
        health.checks.workers = {
            status: 'error',
            message: error instanceof Error ? error.message : String(error),
        };
        health.status = health.status === 'healthy' ? 'degraded' : 'unhealthy';
    }

    const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;

    return NextResponse.json(health, { status: statusCode });
}

