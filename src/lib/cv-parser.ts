/**
 * CV Parser
 * Uses pdf-parse/mammoth for text extraction and OpenAI GPT-4 for parsing
 */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// For very long CVs, process in chunks to avoid response truncation
export const CHUNK_SIZE = 3500; // Drastically reduced to ensure fast processing

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

export const SYSTEM_PROMPT = `You are an expert CV parser. Your job is to analyze CV/resume text and extract it into structured data.

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
- "Role dates like "July 2020 - Present" → extract "2020-07"
- Even if date appears in description text or after a journal name, STILL extract it to the date field.
- EXTREMELY IMPORTANT: Almost every CV entry has a year. If you see any number that looks like a year (1990-2025), extract it.

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

Parse ALL entries you can find in the provided text. Do not summarize or skip any items. Be extremely thorough. ALWAYS extract dates/years when any year is visible. If an entry has no date but the one above it does, look closer for a date. Your response must be a complete and valid JSON object.`;

export async function parseCV(text: string): Promise<ParsedCV> {
    if (!OPENAI_API_KEY && !ANTHROPIC_API_KEY && !GEMINI_API_KEY) {
        throw new Error('No AI API keys are configured (OpenAI, Anthropic, or Gemini)');
    }

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

    // Process all chunks SEQUENTIALLY to prevent 502 Proxy Errors/timeouts
    console.log(`Processing ${chunks.length} chunks sequentially...`);

    const results: ParsedCV[] = [];
    for (let i = 0; i < chunks.length; i++) {
        console.log(`Processing chunk ${i + 1} of ${chunks.length}...`);
        try {
            const result = await parseCVChunk(chunks[i]);
            results.push(result);
        } catch (error) {
            console.error(`Error processing chunk ${i + 1}:`, error);
            results.push({
                profile: { name: null, email: null, phone: null, address: null, institution: null, website: null },
                categories: [],
                rawText: chunks[i]
            });
        }
    }

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
export function splitLargeText(text: string, maxSize: number): string[] {
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

// Parse a single chunk of CV text with fallback logic
export async function parseCVChunk(text: string, attempt: number = 1): Promise<ParsedCV> {
    const userPrompt = `Parse the following CV section and extract all entries. Return ONLY the sections that are present in this text:

${text}`;

    // 1. Try OpenAI if key is available
    if (OPENAI_API_KEY && attempt === 1) {
        try {
            console.log('[Parser] Trying OpenAI...');
            return await parseWithOpenAI(userPrompt, text);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.warn(`[Parser] OpenAI failed: ${errorMessage}. Falling back...`);
            // Continue to fallback
        }
    }

    // 2. Try Anthropic (Claude) if key is available
    if (ANTHROPIC_API_KEY) {
        try {
            console.log('[Parser] Trying Anthropic (Claude)...');
            return await parseWithClaude(userPrompt, text);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.warn(`[Parser] Anthropic failed: ${errorMessage}. Falling back...`);
            // Continue to fallback
        }
    }

    // 3. Try Gemini if key is available
    if (GEMINI_API_KEY) {
        try {
            console.log('[Parser] Trying Google (Gemini)...');
            return await parseWithGemini(userPrompt, text);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`[Parser] Gemini failed: ${errorMessage}`);
            // Last resort or throw if all failed
        }
    }

    // If we're here, all providers failed or were not configured
    throw new Error('All configured AI providers failed to parse CV chunk. Check API quotas and keys.');
}

async function parseWithOpenAI(userPrompt: string, originalText: string): Promise<ParsedCV> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: userPrompt },
            ],
            temperature: 0.2,
            max_tokens: 12000,
            response_format: { type: 'json_object' },
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${error}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '{"categories":[]}';
    const parsed = JSON.parse(content);
    return {
        profile: parsed.profile || { name: null, email: null, phone: null, address: null, institution: null, website: null },
        categories: parsed.categories || [],
        rawText: originalText,
    };
}

async function parseWithClaude(userPrompt: string, originalText: string): Promise<ParsedCV> {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const anthropic = new Anthropic({
        apiKey: ANTHROPIC_API_KEY!,
    });

    const msg = await anthropic.messages.create({
        model: "claude-3-haiku-20240307",
        max_tokens: 4096,
        system: SYSTEM_PROMPT + "\nIMPORTANT: Your response must be NOTHING but the valid JSON object.",
        messages: [{ role: "user", content: userPrompt }],
    });

    // Handle string content from Claude
    const contentText = msg.content[0].type === 'text' ? msg.content[0].text : '';
    // Claude often includes some preamble even if told not to, so attempt to extract JSON
    const jsonMatch = contentText.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : contentText;

    const parsed = JSON.parse(jsonStr);
    return {
        profile: parsed.profile || { name: null, email: null, phone: null, address: null, institution: null, website: null },
        categories: parsed.categories || [],
        rawText: originalText,
    };
}

async function parseWithGemini(userPrompt: string, originalText: string): Promise<ParsedCV> {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
        generationConfig: {
            responseMimeType: "application/json",
        }
    });

    const result = await model.generateContent([
        SYSTEM_PROMPT,
        userPrompt
    ]);

    const contentText = result.response.text();
    const parsed = JSON.parse(contentText);
    return {
        profile: parsed.profile || { name: null, email: null, phone: null, address: null, institution: null, website: null },
        categories: parsed.categories || [],
        rawText: originalText,
    };
}

/**
 * Extract text from PDF buffer using unpdf
 * unpdf is designed for serverless/edge environments
 */
export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
    try {
        // Bypass the faulty index.js in pdf-parse which triggers a debug mode 
        // that tries to read non-existent test files when bundled.
        let pdfModule;
        try {
            // @ts-expect-error - Direct lib import to bypass index.js bug that triggers ENOENT on test files
            pdfModule = await import('pdf-parse/lib/pdf-parse.js');
        } catch {
            console.warn('Direct lib import failed, falling back to main entry point');
            pdfModule = await import('pdf-parse');
        }

        // Classic pdf-parse is a function exported via module.exports
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pdfParser = (pdfModule as any).default || pdfModule;

        if (typeof pdfParser !== 'function') {
            throw new Error('pdf-parse is not a function. Check library installation.');
        }

        const data = await pdfParser(buffer);
        console.log(`Extracted ${data?.text?.length || 0} characters using pdf-parse`);
        return data?.text || '';
    } catch (error) {
        console.error('PDF parsing failed with pdf-parse:', error);
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
