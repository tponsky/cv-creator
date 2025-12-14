import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { parseCV, extractTextFromFile } from '@/lib/cv-parser';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

// Helper to safely parse dates from AI responses
function parseDate(dateStr: string | null | undefined): Date | null {
    if (!dateStr) return null;

    // Try to parse the date
    const date = new Date(dateStr);

    // Check if it's a valid date
    if (isNaN(date.getTime())) {
        console.warn(`Invalid date skipped: ${dateStr}`);
        return null;
    }

    // Reject dates that are too far in past or future
    const year = date.getFullYear();
    if (year < 1900 || year > 2100) {
        console.warn(`Date out of range skipped: ${dateStr}`);
        return null;
    }

    return date;
}

// Get first user (demo mode - no auth)
async function getDemoUser() {
    return await prisma.user.findFirst();
}

/**
 * POST /api/import/cv
 * Upload and parse a CV file (PDF or Word)
 */
export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File | null;

        if (!file) {
            return NextResponse.json(
                { error: 'No file provided' },
                { status: 400 }
            );
        }

        // Validate file type
        const allowedTypes = [
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/msword',
        ];

        if (!allowedTypes.includes(file.type)) {
            return NextResponse.json(
                { error: 'Invalid file type. Please upload a PDF or Word document.' },
                { status: 400 }
            );
        }

        // Get user
        const user = await getDemoUser();
        if (!user) {
            return NextResponse.json(
                { error: 'No user found' },
                { status: 404 }
            );
        }

        // Get or create CV
        let cv = await prisma.cV.findUnique({
            where: { userId: user.id },
        });

        if (!cv) {
            cv = await prisma.cV.create({
                data: {
                    userId: user.id,
                    title: 'My CV',
                },
            });
        }

        // Extract text from file
        const buffer = Buffer.from(await file.arrayBuffer());
        const text = await extractTextFromFile(buffer, file.type);

        console.log(`Extracted ${text.length} characters from CV`);

        // Parse CV with AI
        const parsedCV = await parseCV(text);

        console.log(`Parsed ${parsedCV.categories.length} categories from CV`);

        let totalEntries = 0;

        // Process each category
        for (const parsedCategory of parsedCV.categories) {
            // Find or create category
            let category = await prisma.category.findFirst({
                where: {
                    cvId: cv.id,
                    name: { equals: parsedCategory.name, mode: 'insensitive' },
                },
            });

            if (!category) {
                // Get max display order
                const maxOrder = await prisma.category.findFirst({
                    where: { cvId: cv.id },
                    orderBy: { displayOrder: 'desc' },
                    select: { displayOrder: true },
                });

                category = await prisma.category.create({
                    data: {
                        cvId: cv.id,
                        name: parsedCategory.name,
                        displayOrder: (maxOrder?.displayOrder ?? -1) + 1,
                    },
                });
                console.log(`Created category: ${category.name}`);
            }

            // Create pending entries for each item
            for (const entry of parsedCategory.entries) {
                await prisma.pendingEntry.create({
                    data: {
                        userId: user.id,
                        title: entry.title,
                        description: entry.description,
                        date: parseDate(entry.date),
                        location: entry.location,
                        url: entry.url,
                        sourceType: 'cv-import',
                        sourceData: {
                            originalCategory: parsedCategory.name,
                            importedAt: new Date().toISOString(),
                        },
                        suggestedCategory: parsedCategory.name,
                        status: 'pending',
                    },
                });
                totalEntries++;
            }
        }

        console.log(`Created ${totalEntries} pending entries`);

        return NextResponse.json({
            success: true,
            message: `Imported ${parsedCV.categories.length} categories with ${totalEntries} entries`,
            categoriesFound: parsedCV.categories.length,
            entriesCreated: totalEntries,
            categories: parsedCV.categories.map(c => ({
                name: c.name,
                entryCount: c.entries.length,
            })),
        });
    } catch (error) {
        console.error('CV import error:', error);
        return NextResponse.json(
            { error: String(error) },
            { status: 500 }
        );
    }
}

/**
 * GET /api/import/cv
 * Simple endpoint to verify the upload is accessible
 */
export async function GET() {
    return NextResponse.json({
        status: 'ok',
        message: 'CV import endpoint is active. Upload a PDF or Word document.',
        supportedFormats: ['PDF', 'Word (.docx)', 'Word (.doc)'],
    });
}
