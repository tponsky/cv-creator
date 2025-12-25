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

        // Validate file size (e.g., max 10MB)
        const maxSize = 10 * 1024 * 1024; // 10MB
        if (file.size > maxSize) {
            return NextResponse.json({ 
                error: `File too large. Maximum size is ${maxSize / 1024 / 1024}MB` 
            }, { status: 400 });
        }

        console.log(`[Upload] Received CV ${file.name} (${file.size} bytes) for user ${user.id}`);

        // 1. Extract Text
        let text: string;
        try {
            const buffer = Buffer.from(await file.arrayBuffer());
            text = await extractTextFromFile(buffer, file.type);

            if (!text || text.length < 10) {
                return NextResponse.json({ 
                    error: 'Failed to extract text from file. The file may be corrupted or empty.' 
                }, { status: 400 });
            }
        } catch (extractError) {
            console.error('[Upload] Text extraction failed:', extractError);
            return NextResponse.json({ 
                error: `Failed to extract text: ${extractError instanceof Error ? extractError.message : 'Unknown error'}. Please ensure the file is a valid PDF or Word document.` 
            }, { status: 400 });
        }

        // 2. Queue Job
        let job;
        try {
            job = await cvQueue.add('process-cv', {
                userId: user.id,
                text,
                originalFileName: file.name
            });

            console.log(`[Upload] Job created: ${job.id} for user ${user.id}`);

            // Verify job was actually queued (give it a moment to initialize)
            await new Promise(resolve => setTimeout(resolve, 100));
            const jobState = await job.getState();
            if (jobState === 'failed') {
                throw new Error('Job was immediately marked as failed');
            }

        } catch (queueError) {
            console.error('[Upload] Queue error:', queueError);
            return NextResponse.json({ 
                error: `Failed to queue job: ${queueError instanceof Error ? queueError.message : 'Unknown error'}. Please check if Redis is running and the worker is started.` 
            }, { status: 500 });
        }

        return NextResponse.json({
            jobId: job.id,
            status: 'queued',
            message: 'CV processing started in the background'
        }, { status: 202 });

    } catch (error) {
        console.error('[Upload] Unexpected error:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        return NextResponse.json({ 
            error: `Upload failed: ${errorMessage}` 
        }, { status: 500 });
    }
}
