import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { searchAndFetchArticles, articleToCVEntry } from '@/lib/pubmed-api';
import { getUserFromRequest } from '@/lib/server-auth';

// Normalize title for comparison (lowercase, remove punctuation, trim)
function normalizeTitle(title: string): string {
    return title
        .toLowerCase()
        .replace(/[^\w\s]/g, '') // Remove punctuation
        .replace(/\s+/g, ' ')    // Normalize whitespace
        .trim();
}

/**
 * GET /api/import/pubmed
 * Search PubMed for publications by author name
 * Returns totalFound, newCount, and marks entries as isNew
 */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const authorName = searchParams.get('author');

    if (!authorName) {
        return NextResponse.json(
            { error: 'author parameter is required' },
            { status: 400 }
        );
    }

    try {
        const user = await getUserFromRequest(request);

        const result = await searchAndFetchArticles(authorName, 200);

        // Transform to CV entry format
        const entries = result.articles.map(articleToCVEntry);

        // If no user, just return all as new
        if (!user) {
            return NextResponse.json({
                totalFound: result.count,
                newCount: result.count,
                entries: entries.map(e => ({ ...e, isNew: true })),
            });
        }

        // Get existing PMIDs from pending entries
        const existingPendingPmids = await prisma.pendingEntry.findMany({
            where: {
                userId: user.id,
                sourceType: 'pubmed',
            },
            select: { sourceData: true },
        });

        // Get existing entries from CV
        const cv = await prisma.cV.findUnique({
            where: { userId: user.id },
            include: {
                categories: {
                    include: {
                        entries: {
                            select: { title: true, sourceData: true }
                        }
                    }
                }
            }
        });

        // Collect PMIDs from pending entries
        const pendingPmids = new Set(
            existingPendingPmids
                .map((e: { sourceData: unknown }) => {
                    try {
                        const data = typeof e.sourceData === 'object' ? e.sourceData : JSON.parse(String(e.sourceData) || '{}');
                        return (data as Record<string, unknown>)?.pmid as string;
                    } catch {
                        return null;
                    }
                })
                .filter(Boolean)
        );

        // Collect PMIDs and titles from approved entries
        const approvedPmids = new Set<string>();
        const approvedTitles = new Set<string>();

        if (cv?.categories) {
            for (const cat of cv.categories) {
                for (const entry of cat.entries) {
                    if (entry.title) {
                        approvedTitles.add(normalizeTitle(entry.title));
                    }
                    try {
                        const data = typeof entry.sourceData === 'object' ? entry.sourceData : JSON.parse(String(entry.sourceData) || '{}');
                        const pmid = (data as Record<string, unknown>)?.pmid as string;
                        if (pmid) approvedPmids.add(pmid);
                    } catch {
                        // ignore
                    }
                }
            }
        }

        // Mark each entry as new or existing
        const entriesWithStatus = entries.map(entry => {
            // sourceData is a JSON string from articleToCVEntry
            let pmid: string | null = null;
            try {
                const parsed = typeof entry.sourceData === 'string'
                    ? JSON.parse(entry.sourceData)
                    : entry.sourceData;
                pmid = parsed?.pmid || null;
            } catch {
                // ignore parse errors
            }
            const titleNormalized = normalizeTitle(entry.title);

            const isDuplicate =
                (pmid && pendingPmids.has(pmid)) ||
                (pmid && approvedPmids.has(pmid)) ||
                approvedTitles.has(titleNormalized);

            return {
                ...entry,
                isNew: !isDuplicate,
            };
        });

        const newCount = entriesWithStatus.filter(e => e.isNew).length;

        return NextResponse.json({
            totalFound: result.count,
            newCount,
            entries: entriesWithStatus,
        });
    } catch (error) {
        console.error('PubMed search error:', error);
        return NextResponse.json(
            { error: 'Failed to search PubMed' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/import/pubmed
 * Import selected publications to CV as pending entries
 * Can accept either:
 * - entries: Pre-fetched entries to import directly
 * - authorName + pmids: Fetch from PubMed and filter by pmids
 */
export async function POST(request: NextRequest) {
    const user = await getUserFromRequest(request);
    if (!user) {
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const { authorName, pmids, entries } = body;

    // If entries are provided, import them directly
    if (entries && Array.isArray(entries) && entries.length > 0) {
        try {
            // Create pending entries for selected publications
            const pendingEntries = await Promise.all(
                entries.map((entry: { title: string; description: string; date: string | null; url: string; sourceData?: string }) =>
                    prisma.pendingEntry.create({
                        data: {
                            userId: user.id,
                            title: entry.title,
                            description: entry.description,
                            date: entry.date ? new Date(entry.date) : null,
                            url: entry.url,
                            sourceType: 'pubmed',
                            sourceData: entry.sourceData || '{}',
                            status: 'pending',
                        },
                    })
                )
            );

            return NextResponse.json({
                success: true,
                message: `Added ${pendingEntries.length} publication(s) to pending review`,
                count: pendingEntries.length,
            });
        } catch (error) {
            console.error('PubMed import error:', error);
            return NextResponse.json(
                { error: 'Failed to import publications' },
                { status: 500 }
            );
        }
    }

    // Otherwise, fetch from PubMed
    if (!authorName) {
        return NextResponse.json(
            { error: 'authorName or entries is required' },
            { status: 400 }
        );
    }

    try {
        // Fetch articles from PubMed
        const result = await searchAndFetchArticles(authorName, 200);

        // Filter to selected PMIDs if provided
        const articlesToImport = pmids && pmids.length > 0
            ? result.articles.filter(a => pmids.includes(a.pmid))
            : result.articles;

        // Check for existing pending entries to avoid duplicates
        const existingPendingPmids = await prisma.pendingEntry.findMany({
            where: {
                userId: user.id,
                sourceType: 'pubmed',
            },
            select: { sourceData: true },
        });

        // Also check for already-approved CV entries
        const cv = await prisma.cV.findUnique({
            where: { userId: user.id },
            include: {
                categories: {
                    include: {
                        entries: {
                            select: { title: true, sourceData: true }
                        }
                    }
                }
            }
        });

        // Collect PMIDs from pending entries
        const pendingPmids = existingPendingPmids
            .map((e: { sourceData: unknown }) => {
                try {
                    const data = typeof e.sourceData === 'object' ? e.sourceData : JSON.parse(String(e.sourceData) || '{}');
                    return (data as Record<string, unknown>)?.pmid;
                } catch {
                    return null;
                }
            })
            .filter(Boolean);

        // Collect PMIDs from approved entries + titles for CV imports
        const approvedPmids: string[] = [];
        const approvedTitles: Set<string> = new Set();

        if (cv?.categories) {
            for (const cat of cv.categories) {
                for (const entry of cat.entries) {
                    // Add normalized title for title-based matching
                    if (entry.title) {
                        approvedTitles.add(normalizeTitle(entry.title));
                    }
                    // Also collect PMIDs if available
                    try {
                        const data = typeof entry.sourceData === 'object' ? entry.sourceData : JSON.parse(String(entry.sourceData) || '{}');
                        const pmid = (data as Record<string, unknown>)?.pmid;
                        if (pmid) approvedPmids.push(String(pmid));
                    } catch {
                        // Skip entries without valid sourceData
                    }
                }
            }
        }

        // Also collect titles from pending entries
        const allPendingTitles = await prisma.pendingEntry.findMany({
            where: { userId: user.id },
            select: { title: true },
        });
        const pendingTitles = new Set(
            allPendingTitles.map((e: { title: string }) => normalizeTitle(e.title))
        );

        // Combine all existing PMIDs
        const existingPmidSet = new Set([...pendingPmids, ...approvedPmids]);
        const existingTitleSet = new Set([...Array.from(approvedTitles), ...Array.from(pendingTitles)]);

        console.log(`Found ${existingPmidSet.size} PMIDs and ${existingTitleSet.size} titles to check for duplicates`);

        // Create pending entries for new articles (check both PMID and title)
        const newArticles = articlesToImport.filter(a => {
            // Skip if PMID already exists
            if (existingPmidSet.has(a.pmid)) return false;
            // Skip if title already exists (catches CV imports without PMIDs)
            if (existingTitleSet.has(normalizeTitle(a.title))) return false;
            return true;
        });

        const pendingEntries = await Promise.all(
            newArticles.map(article => {
                const entry = articleToCVEntry(article);
                return prisma.pendingEntry.create({
                    data: {
                        userId: user.id,
                        title: entry.title,
                        description: entry.description,
                        date: entry.date,
                        url: entry.url,
                        sourceType: 'pubmed',
                        sourceData: entry.sourceData,
                        suggestedCategory: 'Publications',
                        status: 'pending',
                    },
                });
            })
        );

        return NextResponse.json({
            imported: pendingEntries.length,
            skipped: articlesToImport.length - pendingEntries.length,
            message: `Imported ${pendingEntries.length} new publications to review queue`,
        });
    } catch (error) {
        console.error('PubMed import error:', error);
        return NextResponse.json(
            { error: 'Failed to import from PubMed' },
            { status: 500 }
        );
    }
}
