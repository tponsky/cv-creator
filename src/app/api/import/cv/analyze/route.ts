import { NextRequest, NextResponse } from 'next/server';
import { extractTextFromFile, splitLargeText, CHUNK_SIZE } from '@/lib/cv-parser';
import { getUserFromRequest } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/import/cv/analyze
 * Extracts raw text from CV and splits into chunks for frontend iteration
 */
export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File | null;

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        // Validate user
        const user = await getUserFromRequest(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Extract text
        const buffer = Buffer.from(await file.arrayBuffer());
        const text = await extractTextFromFile(buffer, file.type);

        console.log(`Extracted ${text.length} characters for user ${user.id}`);

        // Chunking
        const chunks = text.length > CHUNK_SIZE ? splitLargeText(text, CHUNK_SIZE) : [text];

        console.log(`Split CV into ${chunks.length} chunks`);

        return NextResponse.json({
            success: true,
            chunkCount: chunks.length,
            chunks: chunks,
            totalChars: text.length
        });

    } catch (error) {
        console.error('CV analysis error:', error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
