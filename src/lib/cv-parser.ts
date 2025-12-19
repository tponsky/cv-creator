/**
 * CV Parser
 * Uses pdf-parse/mammoth for text extraction and OpenAI GPT-4 for parsing
 */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export interface ParsedCategory {
    name: string;
    entries: ParsedEntry[];
}

export interface ParsedEntry {
    title: string;
    description: string | null;
    date: string | null;
    location: string | null;
    url: string | null;
}

export interface ParsedProfile {
    name: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    institution: string | null;
    website: string | null;
}

export interface ParsedCV {
    profile: ParsedProfile;
    categories: ParsedCategory[];
    rawText: string;
}

const SYSTEM_PROMPT = `You are an expert CV parser. Your job is to analyze CV/resume text and extract it into structured data.

FIRST, extract the person's contact/profile information from the header:
- name: Full name of the person
- email: Email address if present
- phone: Phone number if present
- address: Mailing address or location if present
- institution: Current university/hospital/company affiliation
- website: Personal website or portfolio URL if present

Then, for each section you find (like Publications, Presentations, Awards, Grants, Education, Experience, etc.), extract:
1. The category name (section header)
2. All entries within that section

For each entry, extract:
- title: The main title/name of the item
- description: Any additional details, authors, journal names, etc.
- date: CRITICAL - Extract ANY date/year mentioned. Look for: years like 2024, 2020-2024, Jan 2024, March 2020-Present, etc. Use ISO format (YYYY-MM-DD, YYYY-MM, or YYYY). ALWAYS try to find a date - most CV entries have years.
- location: Location if relevant (city, institution, etc.)
- url: Any URL or DOI if present

IMPORTANT DATE EXTRACTION:
- Publications usually have years like "2024" or "Jan 2024"
- Date ranges like "2018-2022" → use the END date (2022)
- "Present" or "Current" entries → use start date, leave end as null
- Role dates like "July 2020 - Present" → extract "2020-07"
- Even if date appears in description text, STILL extract it to the date field

Common CV sections to look for:
- Publications (peer-reviewed articles, books, chapters)
- Presentations (invited talks, conference presentations)
- Grants & Funding
- Awards & Honors
- Education
- Professional Experience
- Teaching
- Mentoring
- Service & Leadership
- Editorial Boards
- Professional Memberships

Return your response as a JSON object with this structure:
{
  "profile": {
    "name": "Dr. Jane Smith",
    "email": "jane.smith@university.edu",
    "phone": "+1 (555) 123-4567",
    "address": "123 University Ave, Boston, MA",
    "institution": "Harvard Medical School",
    "website": "https://janesmith.com"
  },
  "categories": [
    {
      "name": "Publications",
      "entries": [
        {
          "title": "Paper Title",
          "description": "Author1, Author2. Journal Name. 2024;Vol:Pages.",
          "date": "2024",
          "location": null,
          "url": "https://doi.org/..."
        }
      ]
    }
  ]
}

Parse ALL entries you can find. Be thorough. ALWAYS extract dates when any year is visible. Return ONLY valid JSON.`;

export async function parseCV(text: string): Promise<ParsedCV> {
    if (!OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY is not configured');
    }

    // For very long CVs, process in chunks to avoid response truncation
    const CHUNK_SIZE = 15000; // Characters per chunk (conservative for token limits)

    if (text.length <= CHUNK_SIZE) {
        // Short CV - process in one go
        return parseCVChunk(text);
    }

    // Long CV - split by section headers and process in chunks
    console.log(`Long CV detected (${text.length} chars), processing in chunks...`);

    // Try to split by common section headers
    const sectionPatterns = [
        /\n(?=(?:PUBLICATIONS?|PEER[- ]?REVIEWED|PRESENTATIONS?|GRANTS?|AWARDS?|EDUCATION|EXPERIENCE|TEACHING|MENTORING|SERVICE|LEADERSHIP|PROFESSIONAL|EDITORIAL|COMMITTEE|TRAINING|RESEARCH|CLINICAL|ACADEMIC|HONORS?|PATENTS?|BOOKS?|CHAPTERS?|INVITED|CONFERENCES?|APPOINTMENTS?)\s*[:\n])/gi
    ];

    let sections: string[] = [text];
    // sections is already declared above
    try {
        for (const pattern of sectionPatterns) {
            const newSections: string[] = [];
            for (const section of sections) {
                // Limit section length for regex to prevent potential catastrophic backtracking or size limits
                if (section.length > 500000) {
                    console.warn('Section too large for regex split, keeping as is');
                    newSections.push(section);
                    continue;
                }
                const parts = section.split(pattern);
                newSections.push(...parts);
            }
            if (newSections.length > 1) {
                sections = newSections;
                break;
            }
        }
    } catch (e) {
        console.error('Error splitting CV sections:', e);
        // Fallback: treat as single section if split fails
        sections = [text];
    }

    // Combine small sections, split large ones
    const chunks: string[] = [];
    let currentChunk = '';

    for (const section of sections) {
        if (currentChunk.length + section.length < CHUNK_SIZE) {
            currentChunk += section;
        } else {
            if (currentChunk) chunks.push(currentChunk);
            // If single section is too large, split it
            if (section.length > CHUNK_SIZE) {
                const subChunks = splitLargeText(section, CHUNK_SIZE);
                chunks.push(...subChunks);
            } else {
                currentChunk = section;
            }
        }
    }
    if (currentChunk) chunks.push(currentChunk);

    console.log(`Split CV into ${chunks.length} chunks`);

    // Process all chunks in PARALLEL for speed (avoid timeout)
    console.log(`Processing ${chunks.length} chunks in parallel...`);

    const chunkPromises = chunks.map((chunk, i) =>
        parseCVChunk(chunk).catch(error => {
            console.error(`Error processing chunk ${i + 1}:`, error);
            return { profile: { name: null, email: null, phone: null, address: null, institution: null, website: null }, categories: [], rawText: chunk };
        })
    );

    const results = await Promise.all(chunkPromises);

    // Merge all results
    const allCategories: ParsedCategory[] = [];
    for (const result of results) {
        for (const cat of result.categories) {
            const existing = allCategories.find(c =>
                c.name.toLowerCase() === cat.name.toLowerCase()
            );
            if (existing) {
                existing.entries.push(...cat.entries);
            } else {
                allCategories.push(cat);
            }
        }
    }

    console.log(`Merged ${allCategories.length} categories from ${chunks.length} chunks`);

    // Use the first profile found (usually from the first chunk which has the header)
    const profile = results.find(r => r.profile?.name)?.profile || { name: null, email: null, phone: null, address: null, institution: null, website: null };

    return {
        profile,
        categories: allCategories,
        rawText: text,
    };
}

// Helper function to split large text
function splitLargeText(text: string, maxSize: number): string[] {
    const chunks: string[] = [];
    let start = 0;
    while (start < text.length) {
        // Try to split at a line break
        let end = start + maxSize;
        if (end < text.length) {
            const lastNewline = text.lastIndexOf('\n', end);
            if (lastNewline > start) end = lastNewline;
        }
        chunks.push(text.slice(start, end));
        start = end;
    }
    return chunks;
}

// Parse a single chunk of CV text
async function parseCVChunk(text: string): Promise<ParsedCV> {
    const userPrompt = `Parse the following CV section and extract all entries. Return ONLY the sections that are present in this text:

${text}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini', // Use mini for faster responses on chunks
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: userPrompt },
            ],
            temperature: 0.2,
            max_tokens: 8000, // Smaller response per chunk
            response_format: { type: 'json_object' },
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${error}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '{"categories":[]}';

    try {
        const parsed = JSON.parse(content);
        return {
            profile: parsed.profile || { name: null, email: null, phone: null, address: null, institution: null, website: null },
            categories: parsed.categories || [],
            rawText: text,
        };
    } catch (e) {
        console.error('Failed to parse CV chunk response:', content.slice(0, 500), e);
        return {
            profile: { name: null, email: null, phone: null, address: null, institution: null, website: null },
            categories: [],
            rawText: text,
        };
    }
}

/**
 * Extract text from PDF buffer using unpdf
 * unpdf is designed for serverless/edge environments
 */
export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
    try {
        // unpdf is a serverless-friendly PDF library
        const { extractText } = await import('unpdf');

        // Extract text from the PDF (unpdf requires Uint8Array)
        const uint8Array = new Uint8Array(buffer);
        const result = await extractText(uint8Array);

        // Join all text content (result.text is string[])
        const text = result.text;
        return Array.isArray(text) ? text.join('\n') : (text || '');
    } catch (error) {
        console.error('PDF parsing failed:', error);
        throw new Error(`Failed to parse PDF: ${error instanceof Error ? error.message : 'Unknown error'}. Please try uploading a Word (.docx) document instead.`);
    }
}

/**
 * Extract text from Word document buffer
 */
export async function extractTextFromWord(buffer: Buffer): Promise<string> {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
}

/**
 * Extract text from a file based on its type
 */
export async function extractTextFromFile(buffer: Buffer, mimeType: string): Promise<string> {
    if (mimeType === 'application/pdf') {
        return extractTextFromPDF(buffer);
    } else if (
        mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        mimeType === 'application/msword'
    ) {
        return extractTextFromWord(buffer);
    } else {
        throw new Error(`Unsupported file type: ${mimeType}`);
    }
}
