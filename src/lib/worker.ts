import { Worker, Job } from 'bullmq';
import { redis } from './redis';
import { CV_QUEUE_NAME, CVJobData } from './queue';
import { parseCVChunk, ParsedCV } from './cv-parser';
import prisma from '@/lib/prisma';

// Add error handlers for uncaught errors
process.on('unhandledRejection', (reason, promise) => {
    console.error('[Worker] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('[Worker] Uncaught Exception:', error);
    // Don't exit immediately, let the worker handle it
});

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

// Verify Redis connection before starting worker
async function verifyRedisConnection() {
    try {
        await redis.ping();
        console.log('[Worker] Redis connection verified');
        return true;
    } catch (error) {
        console.error('[Worker] Redis connection failed:', error);
        return false;
    }
}

// Verify database connection
async function verifyDatabaseConnection() {
    try {
        await prisma.$connect();
        console.log('[Worker] Database connection verified');
        return true;
    } catch (error) {
        console.error('[Worker] Database connection failed:', error);
        return false;
    }
}

const worker = new Worker(
    CV_QUEUE_NAME,
    async (job: Job<CVJobData>) => {
        const { userId, text } = job.data;
        const jobStartTime = Date.now();
        console.log(`[Worker] Starting job ${job.id} for user ${userId} (${text.length} chars)`);

        try {
            // Validate job data
            if (!userId || !text || text.length < 10) {
                throw new Error(`Invalid job data: userId=${userId}, textLength=${text?.length || 0}`);
            }

            await job.updateProgress(5); // Initial setup

            // 1. Determine if we can process in one go or move to smart chunking
            let parsedResults: ParsedCV[] = [];

            // Use smaller chunks for better reliability
            const CHUNK_SIZE = 15000; // Reduced from 40k for better reliability
            
            if (text.length < CHUNK_SIZE) {
                console.log(`[Worker] Processing entire CV in one call`);
                await job.updateProgress(10); // Starting parsing
                const result = await parseCVChunk(text);
                parsedResults = [result];
                await job.updateProgress(65); // Parsing complete
            } else {
                console.log(`[Worker] CV is large (${text.length} chars). Using smaller chunks (${CHUNK_SIZE} chars each).`);
                await job.updateProgress(10); // Starting chunking
                const chunks = splitBySections(text, CHUNK_SIZE);
                console.log(`[Worker] Split into ${chunks.length} chunks`);

                // Process sequentially with error tolerance
                // Progress: 10% (start) to 65% (end of parsing)
                // That's 55% for parsing, divided among chunks
                const parsingProgressRange = 55; // 10% to 65%
                
                for (let i = 0; i < chunks.length; i++) {
                    console.log(`[Worker] Processing chunk ${i + 1}/${chunks.length}`);
                    await job.updateProgress(10 + Math.floor((i / chunks.length) * parsingProgressRange));
                    
                    try {
                        const result = await parseCVChunk(chunks[i]);
                        // Only add if we got some data
                        if (result.categories.length > 0 || result.profile?.name) {
                            parsedResults.push(result);
                        }
                        // Update progress after each chunk completes
                        await job.updateProgress(10 + Math.floor(((i + 1) / chunks.length) * parsingProgressRange));
                    } catch (error) {
                        console.warn(`[Worker] Chunk ${i + 1} failed, continuing with next chunk:`, error);
                        // Still update progress even if chunk failed
                        await job.updateProgress(10 + Math.floor(((i + 1) / chunks.length) * parsingProgressRange));
                        // Continue processing other chunks
                    }
                }
            }
            
            // If we got no results, that's okay - better than failing completely
            if (parsedResults.length === 0) {
                console.warn('[Worker] No data extracted, but continuing to avoid complete failure');
                parsedResults.push({
                    profile: { name: null, email: null, phone: null, address: null, institution: null, website: null },
                    categories: [],
                    rawText: text
                });
            }

            await job.updateProgress(65); // Parsing phase complete

            // 2. Database Persistence Logic (Optimized)
            console.log(`[Worker] Persisting results to database for user ${userId}`);
            await job.updateProgress(70); // Starting database operations

            let cv = await prisma.cV.findUnique({ where: { userId } });
            if (!cv) {
                cv = await prisma.cV.create({ data: { userId, title: 'My CV' } });
            }
            await job.updateProgress(72); // CV found/created

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
            await job.updateProgress(75); // Fetching existing data
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
            await job.updateProgress(78); // Existing data loaded

            const createEntryKey = (title: string, date: Date | null, description: string | null) => {
                const t = title.toLowerCase().trim().replace(/\s+/g, ' ').slice(0, 100);
                const d = date ? date.toISOString().split('T')[0] : 'nodate';
                // Use a snippet of description to differentiate entries with same title/date
                const desc = (description || '').toLowerCase().trim().replace(/\s+/g, ' ').slice(0, 50);
                return `${t}|${d}|${desc}`;
            };

            const existingKeys = new Set(existingEntries.map(e => createEntryKey(e.title, e.date, e.description)));

            let createdCount = 0;
            const totalCategories = parsedResults.reduce((sum, r) => sum + r.categories.length, 0);
            let processedCategories = 0;

            // Merge and save categories/entries
            // Progress: 78% to 95% for saving (17% range)
            for (const result of parsedResults) {
                for (const parsedCat of result.categories) {
                    processedCategories++;
                    // Update progress as we save each category
                    if (totalCategories > 0) {
                        await job.updateProgress(78 + Math.floor((processedCategories / totalCategories) * 17));
                    }
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

                    // Advanced date parsing helper to handle various GPT formats
                    const parseDate = (d: string | null) => {
                        if (!d) return null;
                        const dateStr = d.trim();

                        // Try native Date first
                        const nativeDate = new Date(dateStr);
                        if (!isNaN(nativeDate.getTime())) return nativeDate;

                        // Try to extract year-only or month-year if native fails
                        // GPT sometimes gives "2024" or "May 2024"
                        const yearMatch = dateStr.match(/\b(19|20)\d{2}\b/);
                        if (yearMatch) {
                            const year = parseInt(yearMatch[0]);
                            const monthMap: Record<string, number> = {
                                'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
                                'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
                            };

                            const lowerStr = dateStr.toLowerCase();
                            let month = 0;
                            for (const [m, i] of Object.entries(monthMap)) {
                                if (lowerStr.includes(m)) {
                                    month = i;
                                    break;
                                }
                            }
                            return new Date(year, month, 1);
                        }
                        return null;
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

            await job.updateProgress(95); // All data saved
            const duration = Date.now() - jobStartTime;
            console.log(`[Worker] Completed job ${job.id}. Created ${createdCount} entries in ${duration}ms`);
            await job.updateProgress(100); // Complete
            return { createdCount };

        } catch (error) {
            const duration = Date.now() - jobStartTime;
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error.stack : undefined;
            console.error(`[Worker] Job ${job.id} failed after ${duration}ms:`, errorMessage);
            if (errorStack) {
                console.error(`[Worker] Error stack:`, errorStack);
            }
            // Re-throw to mark job as failed
            throw error;
        }
    },
    {
        connection: redis,
        concurrency: 2, // Allow 2 CVs to be parsed at once
    }
);

// Worker event handlers for better monitoring
worker.on('completed', (job) => {
    console.log(`[Worker] Job ${job.id} completed successfully`);
});

worker.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job?.id || 'unknown'} failed:`, err.message);
});

worker.on('error', (err) => {
    console.error('[Worker] Worker error:', err);
});

worker.on('stalled', (jobId) => {
    console.warn(`[Worker] Job ${jobId} stalled`);
});

// Initialize connections and start worker
async function startWorker() {
    console.log('[Worker] Initializing worker...');
    
    const redisOk = await verifyRedisConnection();
    if (!redisOk) {
        console.error('[Worker] Cannot start: Redis connection failed');
        process.exit(1);
    }

    const dbOk = await verifyDatabaseConnection();
    if (!dbOk) {
        console.error('[Worker] Cannot start: Database connection failed');
        process.exit(1);
    }

    console.log(`[Worker] CV processing worker started and listening for jobs on queue: ${CV_QUEUE_NAME}`);
}

// Start the worker
startWorker().catch((error) => {
    console.error('[Worker] Failed to start worker:', error);
    process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('[Worker] SIGTERM received, closing worker gracefully...');
    await worker.close();
    await redis.quit();
    await prisma.$disconnect();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('[Worker] SIGINT received, closing worker gracefully...');
    await worker.close();
    await redis.quit();
    await prisma.$disconnect();
    process.exit(0);
});

export default worker;
