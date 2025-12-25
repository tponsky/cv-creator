import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getUserFromRequest } from '@/lib/server-auth';
import { extractTextFromFile } from '@/lib/cv-parser';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes max for Vercel

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Helper to parse dates
function parseDate(dateStr: string | null | undefined): Date | null {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    const year = date.getFullYear();
    if (year < 1900 || year > 2100) return null;
    return date;
}

// Parse a single chunk with OpenAI
async function parseChunkWithOpenAI(text: string, chunkIndex: number, totalChunks: number): Promise<{
    categories: Array<{ name: string; entries: Array<{ title: string; description: string | null; date: string | null; location: string | null; url: string | null }> }>;
}> {
    const prompt = `Parse this CV/resume section and extract ALL entries. Return JSON only.

For each section (Publications, Presentations, Grants, Awards, Education, Experience, etc.), extract every single entry.

For each entry extract:
- title: The full title/name
- description: Authors, journal, or additional details
- date: Any year or date (format: YYYY or YYYY-MM-DD)
- location: Location if mentioned
- url: Any URL, DOI, or PMID

Return format:
{
  "categories": [
    {
      "name": "Section Name",
      "entries": [
        { "title": "...", "description": "...", "date": "...", "location": "...", "url": "..." }
      ]
    }
  ]
}

CV TEXT (chunk ${chunkIndex + 1}/${totalChunks}):
${text}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'user', content: prompt },
            ],
            temperature: 0.1,
            max_tokens: 16000,
            response_format: { type: 'json_object' },
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        console.error(`[Smart Parser] OpenAI error for chunk ${chunkIndex + 1}:`, error);
        return { categories: [] };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
        return { categories: [] };
    }

    try {
        const parsed = JSON.parse(content);
        return { categories: parsed.categories || [] };
    } catch {
        console.error(`[Smart Parser] JSON parse error for chunk ${chunkIndex + 1}`);
        return { categories: [] };
    }
}

// Split text into chunks by section headers
function splitIntoChunks(text: string, maxChunkSize: number = 8000): string[] {
    // Try to split by common CV section headers
    const sectionPattern = /\n(?=(?:PUBLICATIONS?|PEER[- ]?REVIEWED|PRESENTATIONS?|ABSTRACTS?|GRANTS?|FUNDING|AWARDS?|HONORS?|EDUCATION|EXPERIENCE|TEACHING|MENTORING|SERVICE|LEADERSHIP|PROFESSIONAL|EDITORIAL|COMMITTEE|TRAINING|RESEARCH|CLINICAL|ACADEMIC|PATENTS?|BOOKS?|CHAPTERS?|INVITED|CONFERENCES?|APPOINTMENTS?|POSITIONS?|MEMBERSHIPS?|CERTIFICATIONS?|LICENSURE|BOARDS?)\s*[:\n])/gi;
    
    const sections = text.split(sectionPattern);
    const chunks: string[] = [];
    let currentChunk = '';
    
    for (const section of sections) {
        if (currentChunk.length + section.length < maxChunkSize) {
            currentChunk += section;
        } else {
            if (currentChunk.trim()) {
                chunks.push(currentChunk.trim());
            }
            // If section itself is too large, split it
            if (section.length > maxChunkSize) {
                const subChunks = splitLargeSection(section, maxChunkSize);
                chunks.push(...subChunks);
                currentChunk = '';
            } else {
                currentChunk = section;
            }
        }
    }
    
    if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
    }
    
    return chunks.length > 0 ? chunks : [text];
}

function splitLargeSection(text: string, maxSize: number): string[] {
    const chunks: string[] = [];
    // Split by double newlines (paragraphs)
    const paragraphs = text.split(/\n\n+/);
    let current = '';
    
    for (const para of paragraphs) {
        if (current.length + para.length < maxSize) {
            current += (current ? '\n\n' : '') + para;
        } else {
            if (current) chunks.push(current);
            current = para.length > maxSize ? para.substring(0, maxSize) : para;
        }
    }
    if (current) chunks.push(current);
    
    return chunks;
}

export async function POST(request: NextRequest) {
    const startTime = Date.now();
    
    try {
        if (!OPENAI_API_KEY) {
            return NextResponse.json(
                { error: 'OpenAI API key not configured' },
                { status: 500 }
            );
        }

        const formData = await request.formData();
        const file = formData.get('file') as File | null;

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        const user = await getUserFromRequest(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        console.log(`[Smart Parser] Processing CV for user ${user.id}: ${file.name} (${file.size} bytes)`);

        // Get or create CV
        let cv = await prisma.cV.findUnique({
            where: { userId: user.id },
        });

        if (!cv) {
            cv = await prisma.cV.create({
                data: { userId: user.id, title: 'My CV' },
            });
        }

        // Extract text from file
        const buffer = Buffer.from(await file.arrayBuffer());
        const text = await extractTextFromFile(buffer, file.type);
        
        console.log(`[Smart Parser] Extracted ${text.length} characters`);

        // Split into manageable chunks
        const chunks = splitIntoChunks(text, 8000);
        console.log(`[Smart Parser] Split into ${chunks.length} chunks`);

        // Process chunks with OpenAI (in parallel for speed, max 3 at a time)
        const allCategories: Array<{ name: string; entries: Array<{ title: string; description: string | null; date: string | null; location: string | null; url: string | null }> }> = [];
        
        // Process in batches of 3 for speed without overwhelming the API
        const batchSize = 3;
        for (let i = 0; i < chunks.length; i += batchSize) {
            const batch = chunks.slice(i, i + batchSize);
            const batchPromises = batch.map((chunk, idx) => 
                parseChunkWithOpenAI(chunk, i + idx, chunks.length)
            );
            
            const batchResults = await Promise.all(batchPromises);
            
            for (const result of batchResults) {
                if (result.categories) {
                    allCategories.push(...result.categories);
                }
            }
            
            console.log(`[Smart Parser] Processed ${Math.min(i + batchSize, chunks.length)}/${chunks.length} chunks`);
        }

        // Merge categories with same name
        const mergedCategories = new Map<string, typeof allCategories[0]>();
        for (const cat of allCategories) {
            const key = cat.name.toLowerCase().trim();
            if (mergedCategories.has(key)) {
                mergedCategories.get(key)!.entries.push(...cat.entries);
            } else {
                mergedCategories.set(key, { name: cat.name, entries: [...cat.entries] });
            }
        }

        console.log(`[Smart Parser] Merged into ${mergedCategories.size} categories`);

        // Get existing entries for deduplication
        const existingEntries = await prisma.entry.findMany({
            where: { category: { cvId: cv.id } },
            select: { title: true },
        });
        const normalizeTitle = (title: string) => title.toLowerCase().trim().replace(/\s+/g, ' ').slice(0, 100);
        const existingTitles = new Set(existingEntries.map(e => normalizeTitle(e.title)));

        let totalEntries = 0;
        let skippedDuplicates = 0;

        // Save to database
        const categoryArray = Array.from(mergedCategories.values());
        for (const parsedCategory of categoryArray) {
            // Find or create category
            let category = await prisma.category.findFirst({
                where: {
                    cvId: cv.id,
                    name: { equals: parsedCategory.name, mode: 'insensitive' },
                },
            });

            if (!category) {
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
                console.log(`[Smart Parser] Created category: ${category.name}`);
            }

            // Create entries
            for (const entry of parsedCategory.entries) {
                if (!entry.title || entry.title.length < 5) continue;
                
                const normalizedTitle = normalizeTitle(entry.title);
                if (existingTitles.has(normalizedTitle)) {
                    skippedDuplicates++;
                    continue;
                }
                existingTitles.add(normalizedTitle);

                const maxEntryOrder = await prisma.entry.findFirst({
                    where: { categoryId: category.id },
                    orderBy: { displayOrder: 'desc' },
                    select: { displayOrder: true },
                });

                await prisma.entry.create({
                    data: {
                        categoryId: category.id,
                        title: entry.title.substring(0, 500),
                        description: entry.description?.substring(0, 2000) || null,
                        date: parseDate(entry.date),
                        location: entry.location,
                        url: entry.url,
                        sourceType: 'cv-import',
                        sourceData: {
                            importedAt: new Date().toISOString(),
                            parser: 'smart-openai',
                        },
                        displayOrder: (maxEntryOrder?.displayOrder ?? -1) + 1,
                    },
                });
                totalEntries++;
            }
        }

        const totalTime = Date.now() - startTime;
        console.log(`[Smart Parser] Complete! Created ${totalEntries} entries, skipped ${skippedDuplicates} duplicates in ${totalTime}ms`);

        return NextResponse.json({
            success: true,
            message: `Imported ${mergedCategories.size} categories with ${totalEntries} new entries`,
            categoriesFound: mergedCategories.size,
            entriesCreated: totalEntries,
            duplicatesSkipped: skippedDuplicates,
            processingTime: totalTime,
        });

    } catch (error) {
        console.error('[Smart Parser] Error:', error);
        return NextResponse.json(
            { error: String(error) },
            { status: 500 }
        );
    }
}

