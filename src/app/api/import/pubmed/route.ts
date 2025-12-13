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
        const existingPmids = await prisma.pendingEntry.findMany({
            where: {
                userId: user.id,
                sourceType: 'pubmed',
            },
            select: { sourceData: true },
        });

        const existingPmidSet = new Set(
            existingPmids
                .map((e: { sourceData: unknown }) => {
                    try {
                        const sourceDataStr = typeof e.sourceData === 'string'
                            ? e.sourceData
                            : JSON.stringify(e.sourceData);
                        const data = JSON.parse(sourceDataStr || '{}');
                        return data.pmid;
                    } catch {
                        return null;
                    }
                })
                .filter(Boolean)
        );

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
