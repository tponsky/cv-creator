import { NextRequest, NextResponse } from 'next/server';
import { cvQueue } from '@/lib/queue';
import { getUserFromRequest } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/import/cv/status/[jobId]
 * Check status of a CV processing job
 */
export async function GET(
    request: NextRequest,
    { params }: { params: { jobId: string } }
) {
    try {
        const user = await getUserFromRequest(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { jobId } = params;
        const job = await cvQueue.getJob(jobId);

        if (!job) {
            return NextResponse.json({ error: 'Job not found' }, { status: 404 });
        }

        // Security check: ensure the job belongs to the current user
        if (job.data.userId !== user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const state = await job.getState();
        const progress = job.progress;
        const result = job.returnvalue;
        const failedReason = job.failedReason;

        return NextResponse.json({
            jobId,
            state, // 'waiting', 'active', 'completed', 'failed', 'delayed'
            progress,
            result,
            failedReason,
            isFinished: ['completed', 'failed'].includes(state)
        });

    } catch (error) {
        console.error('[Status] error:', error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
