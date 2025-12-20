import { Worker, Job } from 'bullmq';
import { redis } from './redis';
import { CV_QUEUE_NAME, CVJobData } from './queue';
import { parseCVChunk, ParsedCV } from './cv-parser';
import prisma from '@/lib/prisma';

/**
 * Smart section-aware splitting for genuinely large CVs
 */
function splitBySections(text: string, maxChars: number = 80000): string[] {
    // Regex: Split on double newlines followed by what looks like a Header (Uppercase words)
    const SECTION_HEADER_REGEX = /\n{2,}(?=[A-Z][A-Z\s]{2,}:?\n)/g;

    const sections = text.split(SECTION_HEADER_REGEX);
    const chunks: string[] = [];
    let currentChunk = '';
    const overlapSize = 500;

    for (const section of sections) {
        if (currentChunk.length + section.length < maxChars) {
            currentChunk += (currentChunk ? '\n\n' : '') + section;
        } else {
            if (currentChunk) chunks.push(currentChunk);

            // If a single section is larger than maxChars, we must split it by length
            if (section.length > maxChars) {
                let start = 0;
                while (start < section.length) {
                    const end = start + maxChars;
                    // Add overlap from previous part if not the first part
                    const part = section.slice(Math.max(0, start - overlapSize), end);
                    chunks.push(part);
                    start = end;
                }
                currentChunk = '';
            } else {
                // Start new chunk with current section and overlap from previous
                const overlap = currentChunk.slice(-overlapSize);
                currentChunk = overlap + '\n\n' + section;
            }
        }
    }
    if (currentChunk) chunks.push(currentChunk);

    return chunks;
}

const worker = new Worker(
    CV_QUEUE_NAME,
    async (job: Job<CVJobData>) => {
        const { userId, text } = job.data;
        console.log(`[Worker] Starting job ${job.id} for user ${userId} (${text.length} chars)`);

        try {
            await job.updateProgress(10);

            // 1. Determine if we can process in one go or move to smart chunking
            // OpenAI handles ~128k tokens, but we keep a buffer. 100k chars is very safe (~25k tokens).
            let parsedResults: ParsedCV[] = [];

            if (text.length < 30000) {
                console.log(`[Worker] Processing entire CV in one call`);
                const result = await parseCVChunk(text);
                parsedResults = [result];
            } else {
                console.log(`[Worker] CV is large (${text.length} chars). Using granular section-aware chunking.`);
                const chunks = splitBySections(text, 25000); // 25k chars per chunk for maximum yield and safety
                console.log(`[Worker] Split into ${chunks.length} smart chunks`);

                // Process in parallel with controlled concurrency if needed, but for now Promise.all
                const results = await Promise.all(
                    chunks.map((chunk, i) => {
                        console.log(`[Worker] Processing chunk ${i + 1}/${chunks.length}`);
                        return parseCVChunk(chunk);
                    })
                );
                parsedResults = results;
            }

            await job.updateProgress(60);

            // 2. Database Persistence Logic (Optimized)
            console.log(`[Worker] Persisting results to database for user ${userId}`);

            let cv = await prisma.cV.findUnique({ where: { userId } });
            if (!cv) {
                cv = await prisma.cV.create({ data: { userId, title: 'My CV' } });
            }

            // Profile update from the first result (usually header)
            const firstResult = parsedResults.find(r => r.profile?.name);
            if (firstResult?.profile) {
                const p = firstResult.profile;
                await prisma.user.update({
                    where: { id: userId },
                    data: {
                        name: p.name || undefined,
                        institution: p.institution || undefined,
                        phone: p.phone || undefined,
                        address: p.address || undefined,
                        website: p.website || undefined,
                    }
                });
            }

            // Pre-fetch categories for the CV
            const currentCategories = await prisma.category.findMany({
                where: { cvId: cv.id },
                select: { id: true, name: true }
            });
            const categoryMap = new Map(currentCategories.map(c => [c.name.toLowerCase(), c.id]));

            // Pre-fetch existing entries to create robust deduplication keys
            const existingEntries = await prisma.entry.findMany({
                where: { category: { cvId: cv.id } },
                select: { title: true, date: true, description: true },
            });

            const createEntryKey = (title: string, date: Date | null, description: string | null) => {
                const t = title.toLowerCase().trim().replace(/\s+/g, ' ').slice(0, 100);
                const d = date ? date.toISOString().split('T')[0] : 'nodate';
                // Use a snippet of description to differentiate entries with same title/date
                const desc = (description || '').toLowerCase().trim().replace(/\s+/g, ' ').slice(0, 50);
                return `${t}|${d}|${desc}`;
            };

            const existingKeys = new Set(existingEntries.map(e => createEntryKey(e.title, e.date, e.description)));

            let createdCount = 0;

            // Merge and save categories/entries
            for (const result of parsedResults) {
                for (const parsedCat of result.categories) {
                    const catNameLower = parsedCat.name.toLowerCase();
                    let categoryId = categoryMap.get(catNameLower);

                    if (!categoryId) {
                        const maxOrderObj = await prisma.category.findFirst({
                            where: { cvId: cv!.id },
                            orderBy: { displayOrder: 'desc' },
                            select: { displayOrder: true }
                        });
                        const nextCatOrder = (maxOrderObj?.displayOrder ?? -1) + 1;

                        const newCat = await prisma.category.create({
                            data: {
                                cvId: cv!.id,
                                name: parsedCat.name,
                                displayOrder: nextCatOrder,
                            }
                        });
                        categoryId = newCat.id;
                        categoryMap.set(catNameLower, categoryId);
                    }

                    // Get max order once per category in this worker run to increment in memory
                    const maxEntryOrderObj = await prisma.entry.findFirst({
                        where: { categoryId },
                        orderBy: { displayOrder: 'desc' },
                        select: { displayOrder: true }
                    });
                    let currentDisplayOrder = (maxEntryOrderObj?.displayOrder ?? -1) + 1;

                    // Basic date parsing helper
                    const parseDate = (d: string | null) => {
                        if (!d) return null;
                        const date = new Date(d);
                        return isNaN(date.getTime()) ? null : date;
                    };

                    for (const entry of parsedCat.entries) {
                        const entryDate = parseDate(entry.date);
                        const entryKey = createEntryKey(entry.title, entryDate, entry.description);

                        if (existingKeys.has(entryKey)) continue;

                        existingKeys.add(entryKey);

                        await prisma.entry.create({
                            data: {
                                categoryId,
                                title: entry.title,
                                description: entry.description,
                                date: entryDate,
                                location: entry.location,
                                url: entry.url,
                                sourceType: 'cv-import',
                                displayOrder: currentDisplayOrder++,
                            }
                        });
                        createdCount++;
                    }
                }
            }

            console.log(`[Worker] Completed job ${job.id}. Created ${createdCount} entries.`);
            await job.updateProgress(100);
            return { createdCount };

        } catch (error) {
            console.error(`[Worker] Job ${job.id} failed:`, error);
            throw error;
        }
    },
    {
        connection: redis,
        concurrency: 2, // Allow 2 CVs to be parsed at once
    }
);

console.log(`[Worker] CV processing worker started and listening for jobs...`);

export default worker;
