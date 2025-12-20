import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { parseCVChunk } from '@/lib/cv-parser';
import { getUserFromRequest } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

function parseDate(dateStr: string | null | undefined): Date | null {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    const year = date.getFullYear();
    if (year < 1900 || year > 2100) return null;
    return date;
}

/**
 * POST /api/import/cv/process-chunk
 * Processes a single chunk of CV text: AI Parse -> Save to DB
 */
export async function POST(request: NextRequest) {
    try {
        const { chunkText, chunkIndex, totalChunks } = await request.json();

        if (!chunkText) {
            return NextResponse.json({ error: 'No chunk text provided' }, { status: 400 });
        }

        // Validate user
        const user = await getUserFromRequest(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

        console.log(`Processing chunk ${chunkIndex + 1}/${totalChunks} for user ${user.id}`);

        // AI Parse
        const parsedChunk = await parseCVChunk(chunkText);

        // AUTO-POPULATE PROFILE (usually on first chunk)
        if (chunkIndex === 0 && parsedChunk.profile) {
            const profileUpdate: Record<string, string | null> = {};
            if (parsedChunk.profile.name) profileUpdate.name = parsedChunk.profile.name;
            if (parsedChunk.profile.phone) profileUpdate.phone = parsedChunk.profile.phone;
            if (parsedChunk.profile.address) profileUpdate.address = parsedChunk.profile.address;
            if (parsedChunk.profile.institution) profileUpdate.institution = parsedChunk.profile.institution;
            if (parsedChunk.profile.website) profileUpdate.website = parsedChunk.profile.website;

            if (Object.keys(profileUpdate).length > 0) {
                await prisma.user.update({
                    where: { id: user.id },
                    data: profileUpdate,
                });
            }
        }

        // BATCH DEDUPLICATION LOOKUP
        const existingEntries = await prisma.entry.findMany({
            where: { category: { cvId: cv.id } },
            select: { title: true },
        });

        const normalizeTitle = (title: string) => title.toLowerCase().trim().replace(/\s+/g, ' ').slice(0, 100);
        const existingTitles = new Set(existingEntries.map(e => normalizeTitle(e.title)));

        // PRE-FETCH CATEGORIES for this CV to avoid repeated lookups
        const cvCategories = await prisma.category.findMany({
            where: { cvId: cv.id }
        });
        const categoryMap = new Map(cvCategories.map(c => [c.name.toLowerCase(), c]));

        let createdCount = 0;

        // Process each category from AI response
        for (const parsedCategory of parsedChunk.categories) {
            const catNameLower = parsedCategory.name.toLowerCase();
            let category = categoryMap.get(catNameLower);

            if (!category) {
                // Determine display order for new category
                const maxOrderObj = await prisma.category.findFirst({
                    where: { cvId: cv.id },
                    orderBy: { displayOrder: 'desc' },
                    select: { displayOrder: true },
                });
                const nextCatOrder = (maxOrderObj?.displayOrder ?? -1) + 1;

                category = await prisma.category.create({
                    data: {
                        cvId: cv.id,
                        name: parsedCategory.name,
                        displayOrder: nextCatOrder,
                    },
                });
                categoryMap.set(catNameLower, category);
            }

            // Get current max display order for this category ONCE
            const maxEntryOrderObj = await prisma.entry.findFirst({
                where: { categoryId: category.id },
                orderBy: { displayOrder: 'desc' },
                select: { displayOrder: true },
            });
            let currentDisplayOrder = (maxEntryOrderObj?.displayOrder ?? -1) + 1;

            // Sequential creation to maintain order and simplify deduplication per chunk
            // Improved: We still do sequential but avoid redundant maxOrder lookups
            for (const entry of parsedCategory.entries) {
                const normalizedNewTitle = normalizeTitle(entry.title);
                if (existingTitles.has(normalizedNewTitle)) {
                    continue;
                }

                existingTitles.add(normalizedNewTitle);

                await prisma.entry.create({
                    data: {
                        categoryId: category!.id,
                        title: entry.title,
                        description: entry.description,
                        date: parseDate(entry.date),
                        location: entry.location,
                        url: entry.url,
                        sourceType: 'cv-import',
                        sourceData: {
                            originalCategory: parsedCategory.name,
                            chunkIndex,
                            importedAt: new Date().toISOString(),
                        },
                        displayOrder: currentDisplayOrder++,
                    },
                });
                createdCount++;
            }
        }

        return NextResponse.json({
            success: true,
            createdCount,
            chunkIndex,
        });

    } catch (error) {
        console.error('Chunk processing error:', error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
