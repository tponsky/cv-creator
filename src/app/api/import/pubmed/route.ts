import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { searchAndFetchArticles, articleToCVEntry } from '@/lib/pubmed-api';

// Get first user (demo mode - no auth)
async function getDemoUser() {
    return await prisma.user.findFirst();
}

/**
 * GET /api/import/pubmed
 * Search PubMed for publications by author name
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
        const result = await searchAndFetchArticles(authorName, 50);

        // Transform to CV entry format
        const entries = result.articles.map(articleToCVEntry);

        return NextResponse.json({
            count: result.count,
            entries,
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
 */
export async function POST(request: NextRequest) {
    const user = await getDemoUser();
    if (!user) {
        return NextResponse.json({ error: 'No user found' }, { status: 404 });
    }

    const { authorName, pmids } = await request.json();

    if (!authorName) {
        return NextResponse.json(
            { error: 'authorName is required' },
            { status: 400 }
        );
    }

    try {
        // Fetch articles from PubMed
        const result = await searchAndFetchArticles(authorName, 100);

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
                            where: {
                                sourceData: { not: null }
                            },
                            select: { sourceData: true }
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

        // Collect PMIDs from approved entries
        const approvedPmids: string[] = [];
        if (cv?.categories) {
            for (const cat of cv.categories) {
                for (const entry of cat.entries) {
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

        // Combine all existing PMIDs
        const existingPmidSet = new Set([...pendingPmids, ...approvedPmids]);
        console.log(`Found ${pendingPmids.length} pending and ${approvedPmids.length} approved PMIDs to skip`);

        // Create pending entries for new articles
        const newArticles = articlesToImport.filter(
            a => !existingPmidSet.has(a.pmid)
        );

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
