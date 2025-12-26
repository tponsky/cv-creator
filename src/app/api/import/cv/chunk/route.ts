import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getUserFromRequest } from '@/lib/server-auth';
import { checkBalance, deductAndLog, PRICING } from '@/lib/billing';

export const dynamic = 'force-dynamic';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Helper to parse dates - handles various formats including date ranges
function parseDate(dateStr: string | null | undefined): Date | null {
    if (!dateStr) return null;
    
    const str = dateStr.trim();
    
    // Handle date ranges like "2018 - Present", "2015-2020", "Jan 2018 - Dec 2020"
    // Extract the START date from ranges
    const rangeMatch = str.match(/^(\d{4})\s*[-–—to]+\s*(?:present|\d{4}|current|now)/i);
    if (rangeMatch) {
        return new Date(parseInt(rangeMatch[1]), 0, 1);
    }
    
    // Handle "Month Year" format like "January 2020" or "Jan 2020"
    const monthYearMatch = str.match(/^(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s*(\d{4})/i);
    if (monthYearMatch) {
        const monthMap: Record<string, number> = {
            'jan': 0, 'january': 0, 'feb': 1, 'february': 1, 'mar': 2, 'march': 2,
            'apr': 3, 'april': 3, 'may': 4, 'jun': 5, 'june': 5,
            'jul': 6, 'july': 6, 'aug': 7, 'august': 7, 'sep': 8, 'sept': 8, 'september': 8,
            'oct': 9, 'october': 9, 'nov': 10, 'november': 10, 'dec': 11, 'december': 11
        };
        const month = monthMap[monthYearMatch[1].toLowerCase()] ?? 0;
        return new Date(parseInt(monthYearMatch[2]), month, 1);
    }
    
    // Handle just a year like "2020"
    const yearOnlyMatch = str.match(/^(\d{4})$/);
    if (yearOnlyMatch) {
        const year = parseInt(yearOnlyMatch[1]);
        if (year >= 1900 && year <= 2100) {
            return new Date(year, 0, 1);
        }
    }
    
    // Handle ISO dates like "2020-01-15" or "2020-01"
    const isoMatch = str.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/);
    if (isoMatch) {
        const year = parseInt(isoMatch[1]);
        const month = parseInt(isoMatch[2]) - 1;
        const day = isoMatch[3] ? parseInt(isoMatch[3]) : 1;
        if (year >= 1900 && year <= 2100) {
            return new Date(year, month, day);
        }
    }
    
    // Try native Date parsing as last resort
    const date = new Date(str);
    if (!isNaN(date.getTime())) {
        const year = date.getFullYear();
        if (year >= 1900 && year <= 2100) {
            return date;
        }
    }
    
    return null;
}

/**
 * POST /api/import/cv/chunk
 * Process a single chunk of CV text
 * Called multiple times from the client for each chunk
 */
export async function POST(request: NextRequest) {
    try {
        if (!OPENAI_API_KEY) {
            return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
        }

        const user = await getUserFromRequest(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Check user balance before processing
        const { hasBalance, currentBalance } = await checkBalance(user.id, PRICING.CV_PARSE_PER_CHUNK);
        if (!hasBalance) {
            return NextResponse.json({ 
                error: 'Insufficient credits. Please add more credits to continue.',
                needsCredits: true,
                currentBalance,
            }, { status: 402 }); // 402 Payment Required
        }

        const body = await request.json();
        const { text, chunkIndex, totalChunks, isFirstChunk, isLastChunk } = body;

        if (!text || typeof text !== 'string') {
            return NextResponse.json({ error: 'No text provided' }, { status: 400 });
        }

        console.log(`[Chunk ${chunkIndex + 1}/${totalChunks}] Processing for user ${user.id} (${text.length} chars)`);

        // Get or create CV
        let cv = await prisma.cV.findUnique({
            where: { userId: user.id },
        });

        if (!cv) {
            cv = await prisma.cV.create({
                data: { userId: user.id, title: 'My CV' },
            });
        }

        // Parse this chunk with OpenAI
        const prompt = `You are parsing an academic CV. Extract ALL entries with their dates. Return JSON only.

CRITICAL DATE EXTRACTION RULES:
1. ALWAYS look for years (1990-2030) near each entry - they may be on the same line OR on a following line
2. Date ranges like "1999-2005" or "2018 - Present" → use the START year (1999, 2018)
3. Degree years like "M.D., 1999" or "B.A., 1995" → extract that year (1999, 1995)
4. If you see a year anywhere near an entry, INCLUDE IT

EXAMPLES:
- "Medical School: Case Western Reserve University, M.D., 1999" → date: "1999"
- "Residency: GWU Hospital, Washington DC, 1999-2005" → date: "1999"
- "Professor of Surgery, 2015 - Present" → date: "2015"
- "Certificate Course, 2002-2003" → date: "2002"

For each entry extract:
- title: Main title (job title, degree type, award name, publication title)
- description: Institution, location, authors, journal, details
- date: THE YEAR (format: "YYYY") - ALWAYS try to find one
- location: City/State if mentioned
- url: Any URL, DOI, or PMID

Return format:
{
  "profile": { "name": "...", "email": "...", "phone": "...", "institution": "..." },
  "categories": [
    {
      "name": "Category Name",
      "entries": [
        { "title": "...", "description": "...", "date": "1999", "location": "...", "url": "..." }
      ]
    }
  ]
}

Parse ALL entries. Do not skip any. Look carefully for dates - they are often at the end of lines.

CV TEXT:
${text.substring(0, 12000)}`; // Limit to 12k chars per chunk

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.1,
                max_tokens: 16000,
                response_format: { type: 'json_object' },
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            console.error(`[Chunk ${chunkIndex + 1}] OpenAI error:`, error);
            return NextResponse.json({ error: 'AI parsing failed' }, { status: 500 });
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;

        if (!content) {
            return NextResponse.json({ 
                success: true, 
                entriesCreated: 0,
                message: 'No content extracted from this chunk'
            });
        }

        let parsed;
        try {
            parsed = JSON.parse(content);
        } catch {
            console.error(`[Chunk ${chunkIndex + 1}] JSON parse error`);
            return NextResponse.json({ 
                success: true, 
                entriesCreated: 0,
                message: 'Could not parse AI response'
            });
        }

        // Update profile if this is first chunk and we got profile data
        if (isFirstChunk && parsed.profile) {
            const profileUpdate: Record<string, string> = {};
            if (parsed.profile.name) profileUpdate.name = parsed.profile.name;
            if (parsed.profile.phone) profileUpdate.phone = parsed.profile.phone;
            // Don't set institution from first chunk - wait for work experience
            
            if (Object.keys(profileUpdate).length > 0) {
                await prisma.user.update({
                    where: { id: user.id },
                    data: profileUpdate,
                });
            }
        }
        
        // Extract institution from work experience (most recent job)
        const workExperience = parsed.categories?.find(
            (c: { name: string }) => c.name.toLowerCase().includes('experience') || 
                c.name.toLowerCase().includes('employment') ||
                c.name.toLowerCase().includes('position')
        );
        if (workExperience?.entries?.[0]) {
            const latestJob = workExperience.entries[0];
            // Try to extract institution from the job title or description
            const institutionMatch = latestJob.description?.match(/(?:at|@)\s*([^,\n]+)/i) ||
                latestJob.title?.match(/(?:at|@)\s*([^,\n]+)/i);
            if (institutionMatch) {
                await prisma.user.update({
                    where: { id: user.id },
                    data: { institution: institutionMatch[1].trim() },
                });
            } else if (latestJob.location) {
                // Use location as institution if no explicit institution found
                await prisma.user.update({
                    where: { id: user.id },
                    data: { institution: latestJob.location },
                });
            }
        }

        // Get existing entries for deduplication (include id and date for updating)
        const existingEntries = await prisma.entry.findMany({
            where: { category: { cvId: cv.id } },
            select: { id: true, title: true, date: true },
        });
        const normalizeTitle = (title: string) => title.toLowerCase().trim().replace(/\s+/g, ' ').slice(0, 100);
        const existingEntriesMap = new Map(existingEntries.map(e => [normalizeTitle(e.title), e]));

        let entriesCreated = 0;
        let entriesUpdated = 0;
        let duplicatesSkipped = 0;
        const categoriesProcessed: string[] = [];
        const processedTitles = new Set<string>();

        // Save entries from this chunk
        const categories = parsed.categories || [];
        for (const parsedCategory of categories) {
            if (!parsedCategory.name || !parsedCategory.entries) continue;

            categoriesProcessed.push(parsedCategory.name);

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
            }

            // Create entries
            for (const entry of parsedCategory.entries) {
                if (!entry.title || entry.title.length < 5) continue;

                const normalizedTitle = normalizeTitle(entry.title);
                const newDate = parseDate(entry.date);
                
                // Check if we already processed this title in this batch
                if (processedTitles.has(normalizedTitle)) {
                    duplicatesSkipped++;
                    continue;
                }
                
                // Check if entry exists
                const existingEntry = existingEntriesMap.get(normalizedTitle);
                
                if (existingEntry) {
                    // Entry exists - check if we should update it
                    if (!existingEntry.date && newDate) {
                        // Existing entry has no date but new one does - UPDATE it
                        await prisma.entry.update({
                            where: { id: existingEntry.id },
                            data: {
                                date: newDate,
                                description: entry.description?.substring(0, 2000) || existingEntry.id, // Keep existing if no new one
                                location: entry.location || undefined,
                            },
                        });
                        entriesUpdated++;
                        processedTitles.add(normalizedTitle);
                    } else {
                        // Entry exists with date already - skip
                        duplicatesSkipped++;
                    }
                    continue;
                }
                
                processedTitles.add(normalizedTitle);

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
                        date: newDate,
                        location: entry.location,
                        url: entry.url,
                        sourceType: 'cv-import',
                        sourceData: {
                            importedAt: new Date().toISOString(),
                            chunkIndex,
                        },
                        displayOrder: (maxEntryOrder?.displayOrder ?? -1) + 1,
                    },
                });
                entriesCreated++;
            }
        }

        console.log(`[Chunk ${chunkIndex + 1}/${totalChunks}] Created ${entriesCreated}, updated ${entriesUpdated} (added dates), skipped ${duplicatesSkipped} duplicates`);

        // Deduct cost for this chunk
        const { newBalance } = await deductAndLog(
            user.id,
            'cv_parse',
            PRICING.CV_PARSE_PER_CHUNK,
            `CV chunk ${chunkIndex + 1}/${totalChunks}: ${entriesCreated} entries created`
        );

        return NextResponse.json({
            success: true,
            chunkIndex,
            entriesCreated,
            entriesUpdated,
            duplicatesSkipped,
            categoriesProcessed,
            isComplete: isLastChunk,
            balanceRemaining: newBalance,
        });

    } catch (error) {
        console.error('[Chunk] Error:', error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}

