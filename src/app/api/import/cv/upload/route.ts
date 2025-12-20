import { NextRequest, NextResponse } from 'next/server';
import { extractTextFromFile } from '@/lib/cv-parser';
import { cvQueue } from '@/lib/queue';
import { getUserFromRequest } from '@/lib/server-auth';

// Force dynamic to prevent static generation
export const dynamic = 'force-dynamic';

/**
 * POST /api/import/cv/upload
 * Accept CV file, extract text, and queue for background processing
 */
export async function POST(request: NextRequest) {
    try {
        const user = await getUserFromRequest(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const formData = await request.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        console.log(`[Upload] Received CV ${file.name} (${file.size} bytes) for user ${user.id}`);

        // 1. Extract Text
        const buffer = Buffer.from(await file.arrayBuffer());
        const text = await extractTextFromFile(buffer, file.type);

        if (!text || text.length < 10) {
            return NextResponse.json({ error: 'Failed to extract text from file' }, { status: 400 });
        }

        // 2. Queue Job
        const job = await cvQueue.add('process-cv', {
            userId: user.id,
            text,
            originalFileName: file.name
        });

        console.log(`[Upload] Job created: ${job.id} for user ${user.id}`);

        return NextResponse.json({
            jobId: job.id,
            status: 'queued',
            message: 'CV processing started in the background'
        }, { status: 202 });

    } catch (error) {
        console.error('[Upload] error:', error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
