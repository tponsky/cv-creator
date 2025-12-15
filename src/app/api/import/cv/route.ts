import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { parseCV, extractTextFromFile } from '@/lib/cv-parser';
import { getUserFromRequest } from '@/lib/server-auth';

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

        // Get authenticated user
        const user = await getUserFromRequest(request);
        if (!user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
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

        // AUTO-POPULATE PROFILE from CV header info
        if (parsedCV.profile) {
            const profileUpdate: Record<string, string | null> = {};
            if (parsedCV.profile.name) profileUpdate.name = parsedCV.profile.name;
            if (parsedCV.profile.phone) profileUpdate.phone = parsedCV.profile.phone;
            if (parsedCV.profile.address) profileUpdate.address = parsedCV.profile.address;
            if (parsedCV.profile.institution) profileUpdate.institution = parsedCV.profile.institution;
            if (parsedCV.profile.website) profileUpdate.website = parsedCV.profile.website;

            if (Object.keys(profileUpdate).length > 0) {
                await prisma.user.update({
                    where: { id: user.id },
                    data: profileUpdate,
                });
                console.log('Updated user profile from CV:', profileUpdate);
            }
        }

        let totalEntries = 0;
        // GET ALL EXISTING ENTRIES AND PENDING ENTRIES FOR DEDUPLICATION
        const existingEntries = await prisma.entry.findMany({
            where: {
                category: {
                    cvId: cv.id,
                },
            },
            select: { title: true },
        });

        const existingPending = await prisma.pendingEntry.findMany({
            where: {
                userId: user.id,
                status: 'pending',
            },
            select: { title: true },
        });

        // Create a Set of normalized existing titles for fast lookup
        const normalizeTitle = (title: string) => title.toLowerCase().trim().replace(/\s+/g, ' ').slice(0, 100);
        const existingTitles = new Set([
            ...existingEntries.map(e => normalizeTitle(e.title)),
            ...existingPending.map(e => normalizeTitle(e.title)),
        ]);

        console.log(`Found ${existingTitles.size} existing entries/pending for deduplication`);

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

            // Create pending entries for each item (with deduplication)
            let skippedDuplicates = 0;
            for (const entry of parsedCategory.entries) {
                // CHECK FOR DUPLICATES - skip if similar title already exists
                const normalizedNewTitle = normalizeTitle(entry.title);
                if (existingTitles.has(normalizedNewTitle)) {
                    skippedDuplicates++;
                    continue; // Skip this duplicate entry
                }

                // Add to set to avoid duplicates within same import
                existingTitles.add(normalizedNewTitle);

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

            if (skippedDuplicates > 0) {
                console.log(`Skipped ${skippedDuplicates} duplicates in ${parsedCategory.name}`);
            }
        }

        console.log(`Created ${totalEntries} NEW pending entries (duplicates were skipped)`);

        return NextResponse.json({
            success: true,
            message: `Imported ${parsedCV.categories.length} categories with ${totalEntries} new entries (duplicates skipped)`,
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
