import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getUserFromRequest } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

// Extract date from text - handles various formats including academic CV styles
function extractDateFromText(text: string): Date | null {
    if (!text) return null;
    
    // Normalize the text - replace various dashes and clean up
    const normalizedText = text
        .replace(/–/g, '-')  // en-dash
        .replace(/—/g, '-')  // em-dash
        .replace(/\s+/g, ' ')
        .trim();
    
    // Pattern 1: Date ranges like "1999-2005", "2002 - 2003", "2005 - 2007", "2018-Present"
    const rangeMatch = normalizedText.match(/\b(19\d{2}|20\d{2})\s*-\s*(?:present|current|now|19\d{2}|20\d{2})\b/i);
    if (rangeMatch) {
        const year = parseInt(rangeMatch[1]);
        if (year >= 1950 && year <= 2030) {
            return new Date(year, 0, 1);
        }
    }
    
    // Pattern 2: Standalone 4-digit year anywhere in text (most common in CVs)
    // Look for years like "1995", "1999", "2003" etc.
    const allYears = normalizedText.match(/\b(19\d{2}|20\d{2})\b/g);
    if (allYears && allYears.length > 0) {
        // Use the FIRST year found (usually the start date)
        const year = parseInt(allYears[0]);
        if (year >= 1950 && year <= 2030) {
            return new Date(year, 0, 1);
        }
    }
    
    // Pattern 3: "Month Year" like "January 2020", "Jan. 2020"
    const monthYearMatch = normalizedText.match(/\b(jan(?:uary)?\.?|feb(?:ruary)?\.?|mar(?:ch)?\.?|apr(?:il)?\.?|may\.?|jun(?:e)?\.?|jul(?:y)?\.?|aug(?:ust)?\.?|sep(?:t(?:ember)?)?\.?|oct(?:ober)?\.?|nov(?:ember)?\.?|dec(?:ember)?\.?)\s*,?\s*(\d{4})\b/i);
    if (monthYearMatch) {
        const monthMap: Record<string, number> = {
            'jan': 0, 'january': 0, 'feb': 1, 'february': 1, 'mar': 2, 'march': 2,
            'apr': 3, 'april': 3, 'may': 4, 'jun': 5, 'june': 5,
            'jul': 6, 'july': 6, 'aug': 7, 'august': 7, 'sep': 8, 'sept': 8, 'september': 8,
            'oct': 9, 'october': 9, 'nov': 10, 'november': 10, 'dec': 11, 'december': 11
        };
        const monthKey = monthYearMatch[1].toLowerCase().replace('.', '').replace(/uary|ruary|ch|il|e|y|ust|tember|ober|ember/g, '');
        const month = monthMap[monthKey] ?? 0;
        return new Date(parseInt(monthYearMatch[2]), month, 1);
    }
    
    return null;
}

/**
 * POST /api/cv/fix-dates
 * Reprocess all entries to extract dates from titles/descriptions
 */
export async function POST(request: NextRequest) {
    try {
        const user = await getUserFromRequest(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const cv = await prisma.cV.findUnique({
            where: { userId: user.id },
            include: {
                categories: {
                    include: {
                        entries: true,
                    },
                },
            },
        });

        if (!cv) {
            return NextResponse.json({ error: 'No CV found' }, { status: 404 });
        }

        let updatedCount = 0;
        let skippedCount = 0;
        const updates: { id: string; title: string; extractedDate: string }[] = [];

        for (const category of cv.categories) {
            for (const entry of category.entries) {
                // Skip entries that already have dates
                if (entry.date) {
                    skippedCount++;
                    continue;
                }

                // Combine title and description for date extraction
                // This catches dates that might be in either field
                const combinedText = `${entry.title} ${entry.description || ''}`;
                const extractedDate = extractDateFromText(combinedText);

                if (extractedDate) {
                    await prisma.entry.update({
                        where: { id: entry.id },
                        data: { date: extractedDate },
                    });
                    updatedCount++;
                    updates.push({
                        id: entry.id,
                        title: entry.title.substring(0, 50),
                        extractedDate: extractedDate.toISOString().split('T')[0],
                    });
                }
            }
        }

        console.log(`[Fix Dates] Updated ${updatedCount} entries, skipped ${skippedCount} with existing dates`);

        return NextResponse.json({
            success: true,
            updatedCount,
            skippedCount,
            totalProcessed: updatedCount + skippedCount,
            sampleUpdates: updates.slice(0, 10),
        });

    } catch (error) {
        console.error('[Fix Dates] Error:', error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}

