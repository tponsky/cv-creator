/**
 * PubMed API Integration
 * Uses NCBI E-utilities to search and fetch publication data
 * https://www.ncbi.nlm.nih.gov/books/NBK25500/
 */

const PUBMED_BASE_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

// NCBI API key (optional but recommended for higher rate limits)
// Without key: 3 requests/second, With key: 10 requests/second
const NCBI_API_KEY = process.env.NCBI_API_KEY || '';

export interface PubMedArticle {
    pmid: string;
    title: string;
    authors: string[];
    journal: string;
    pubDate: string;
    doi: string | null;
    abstract: string | null;
}

export interface PubMedSearchResult {
    count: number;
    articles: PubMedArticle[];
}

/**
 * Fetch with retry and exponential backoff for rate limiting
 */
async function fetchWithRetry(url: string, maxRetries: number = 3): Promise<Response> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const response = await fetch(url);
            
            // If rate limited (429 or 503), wait and retry
            if (response.status === 429 || response.status === 503) {
                const waitTime = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s
                console.log(`PubMed rate limited, waiting ${waitTime}ms before retry ${attempt + 1}/${maxRetries}`);
                await new Promise(r => setTimeout(r, waitTime));
                continue;
            }
            
            if (!response.ok) {
                throw new Error(`Request failed: ${response.statusText}`);
            }
            
            return response;
        } catch (error) {
            lastError = error as Error;
            if (attempt < maxRetries - 1) {
                const waitTime = Math.pow(2, attempt + 1) * 1000;
                console.log(`PubMed request failed, waiting ${waitTime}ms before retry ${attempt + 1}/${maxRetries}`);
                await new Promise(r => setTimeout(r, waitTime));
            }
        }
    }
    
    throw lastError || new Error('Max retries exceeded');
}

/**
 * Search PubMed for articles by author name
 */
export async function searchPubMed(
    query: string,
    maxResults: number = 100,
    searchType: 'author' | 'title' | 'all' = 'author'
): Promise<string[]> {
    // Format query for PubMed search
    let term = query.trim();
    if (searchType === 'author') {
        term = `${term}[Author]`;
    } else if (searchType === 'title') {
        term = `${term}[Title]`;
    }

    let searchUrl = `${PUBMED_BASE_URL}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(term)}&retmax=${maxResults}&retmode=json`;
    if (NCBI_API_KEY) {
        searchUrl += `&api_key=${NCBI_API_KEY}`;
    }

    const response = await fetchWithRetry(searchUrl);
    const data = await response.json();
    return data.esearchresult?.idlist || [];
}

/**
 * Fetch article details by PMIDs
 */
export async function fetchArticleDetails(pmids: string[]): Promise<PubMedArticle[]> {
    if (pmids.length === 0) return [];

    let fetchUrl = `${PUBMED_BASE_URL}/efetch.fcgi?db=pubmed&id=${pmids.join(',')}&retmode=xml`;
    if (NCBI_API_KEY) {
        fetchUrl += `&api_key=${NCBI_API_KEY}`;
    }

    const response = await fetchWithRetry(fetchUrl);
    const xmlText = await response.text();
    return parseArticlesFromXml(xmlText);
}

/**
 * Parse PubMed XML response into article objects
 */
function parseArticlesFromXml(xml: string): PubMedArticle[] {
    const articles: PubMedArticle[] = [];

    // Extract each PubmedArticle block
    const articleMatches = xml.match(/<PubmedArticle>[\s\S]*?<\/PubmedArticle>/g) || [];

    for (const articleXml of articleMatches) {
        try {
            const article = parseArticle(articleXml);
            if (article) {
                articles.push(article);
            }
        } catch (e) {
            console.error('Failed to parse article:', e);
        }
    }

    return articles;
}

function parseArticle(xml: string): PubMedArticle | null {
    // Extract PMID
    const pmidMatch = xml.match(/<PMID[^>]*>(\d+)<\/PMID>/);
    if (!pmidMatch) return null;

    // Extract title
    const titleMatch = xml.match(/<ArticleTitle>([^<]+)<\/ArticleTitle>/);
    const title = titleMatch ? decodeXmlEntities(titleMatch[1]) : 'Unknown Title';

    // Extract authors
    const authors: string[] = [];
    const authorRegex = /<Author[^>]*>[\s\S]*?<LastName>([^<]+)<\/LastName>[\s\S]*?<ForeName>([^<]*)<\/ForeName>[\s\S]*?<\/Author>/g;
    let authorMatch;
    while ((authorMatch = authorRegex.exec(xml)) !== null) {
        authors.push(`${authorMatch[1]} ${authorMatch[2]}`.trim());
    }

    // Extract journal
    const journalMatch = xml.match(/<Title>([^<]+)<\/Title>/);
    const journal = journalMatch ? decodeXmlEntities(journalMatch[1]) : 'Unknown Journal';

    // Extract publication date
    const yearMatch = xml.match(/<PubDate>[\s\S]*?<Year>(\d{4})<\/Year>/);
    const monthMatch = xml.match(/<PubDate>[\s\S]*?<Month>([^<]+)<\/Month>/);
    const pubDate = yearMatch
        ? `${yearMatch[1]}${monthMatch ? `-${monthMatch[1]}` : ''}`
        : 'Unknown';

    // Extract DOI
    const doiMatch = xml.match(/<ArticleId IdType="doi">([^<]+)<\/ArticleId>/);
    const doi = doiMatch ? doiMatch[1] : null;

    // Extract abstract
    const abstractMatch = xml.match(/<AbstractText[^>]*>([^<]+)<\/AbstractText>/);
    const abstract = abstractMatch ? decodeXmlEntities(abstractMatch[1]) : null;

    return {
        pmid: pmidMatch[1],
        title,
        authors,
        journal,
        pubDate,
        doi,
        abstract,
    };
}

function decodeXmlEntities(text: string): string {
    return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
}

/**
 * Full search and fetch - returns complete article data
 */
export async function searchAndFetchArticles(
    query: string,
    maxResults: number = 100,
    searchType: 'author' | 'title' | 'all' = 'author'
): Promise<PubMedSearchResult> {
    const pmids = await searchPubMed(query, maxResults, searchType);
    const articles = await fetchArticleDetails(pmids);

    return {
        count: articles.length,
        articles,
    };
}

/**
 * Convert PubMed article to CV entry format
 */
export function articleToCVEntry(article: PubMedArticle) {
    const authorList = article.authors.length > 3
        ? `${article.authors.slice(0, 3).join(', ')}, et al.`
        : article.authors.join(', ');

    return {
        title: article.title,
        description: `${authorList}. ${article.journal}. ${article.pubDate}.${article.doi ? ` DOI: ${article.doi}` : ''}`,
        date: parsePublicationDate(article.pubDate),
        url: `https://pubmed.ncbi.nlm.nih.gov/${article.pmid}/`,
        sourceType: 'pubmed',
        sourceData: JSON.stringify({ pmid: article.pmid, doi: article.doi }),
    };
}

function parsePublicationDate(pubDate: string): Date | null {
    if (!pubDate || pubDate === 'Unknown') return null;

    // Handle "2024" or "2024-Jan" formats
    const parts = pubDate.split('-');
    const year = parseInt(parts[0]);
    if (isNaN(year)) return null;

    const monthMap: Record<string, number> = {
        'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
        'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11,
    };

    const month = parts[1] ? (monthMap[parts[1]] ?? 0) : 0;
    return new Date(year, month, 1);
}
