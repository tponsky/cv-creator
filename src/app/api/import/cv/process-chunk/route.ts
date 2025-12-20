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
    const startTime = Date.now();
    try {
        const { chunkText, chunkIndex, totalChunks } = await request.json();

        if (!chunkText) {
            return NextResponse.json({ error: 'No chunk text provided' }, { status: 400 });
        }

        const user = await getUserFromRequest(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        console.log(`[Chunk ${chunkIndex + 1}/${totalChunks}] START processing for user ${user.id}`);

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

        // AI Parse
        const parseStartTime = Date.now();
        const parsedChunk = await parseCVChunk(chunkText);
        console.log(`[Chunk ${chunkIndex + 1}/${totalChunks}] AI Parse took ${Date.now() - parseStartTime}ms`);

        // Profile Update (First chunk only)
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

        // DB SAVING STRATEGY: 
        // 1. Fetch all existing category names for this CV
        const cvCategories = await prisma.category.findMany({
            where: { cvId: cv.id },
            select: { id: true, name: true }
        });
        const categoryMap = new Map(cvCategories.map(c => [c.name.toLowerCase(), c.id]));

        // 2. Fetch all existing titles for deduplication (only for the current CV)
        const existingEntries = await prisma.entry.findMany({
            where: { category: { cvId: cv.id } },
            select: { title: true },
        });
        const normalizeTitle = (title: string) => title.toLowerCase().trim().replace(/\s+/g, ' ').slice(0, 100);
        const existingTitles = new Set(existingEntries.map(e => normalizeTitle(e.title)));

        let createdCount = 0;

        // 3. Process each category
        for (const parsedCategory of parsedChunk.categories) {
            const catNameLower = parsedCategory.name.toLowerCase();
            let categoryId = categoryMap.get(catNameLower);

            if (!categoryId) {
                const maxOrderObj = await prisma.category.findFirst({
                    where: { cvId: cv.id },
                    orderBy: { displayOrder: 'desc' },
                    select: { displayOrder: true },
                });
                const nextCatOrder = (maxOrderObj?.displayOrder ?? -1) + 1;

                const newCat = await prisma.category.create({
                    data: {
                        cvId: cv.id,
                        name: parsedCategory.name,
                        displayOrder: nextCatOrder,
                    },
                });
                categoryId = newCat.id;
                categoryMap.set(catNameLower, categoryId);
            }

            // Get current max display order for this category
            const maxEntryOrderObj = await prisma.entry.findFirst({
                where: { categoryId },
                orderBy: { displayOrder: 'desc' },
                select: { displayOrder: true },
            });
            let currentDisplayOrder = (maxEntryOrderObj?.displayOrder ?? -1) + 1;

            // Create entries
            for (const entry of parsedCategory.entries) {
                const normalizedNewTitle = normalizeTitle(entry.title);
                if (existingTitles.has(normalizedNewTitle)) continue;

                existingTitles.add(normalizedNewTitle);

                await prisma.entry.create({
                    data: {
                        categoryId,
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

        console.log(`[Chunk ${chunkIndex + 1}/${totalChunks}] FINISHED. Created ${createdCount} entries. Total time: ${Date.now() - startTime}ms`);

        return NextResponse.json({
            success: true,
            createdCount,
            chunkIndex,
        });

    } catch (error) {
        console.error(`[Chunk] error:`, error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
