import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getUserFromRequest } from '@/lib/server-auth';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

const AFFINDA_API_KEY = process.env.AFFINDA_API_KEY;

// Helper to safely parse dates
function parseDate(dateStr: string | null | undefined): Date | null {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    const year = date.getFullYear();
    if (year < 1900 || year > 2100) return null;
    return date;
}

// Map Affinda sections to our category names
function mapAffindaSection(sectionName: string): string {
    const mapping: Record<string, string> = {
        'workExperience': 'Professional Experience',
        'education': 'Education',
        'skills': 'Skills',
        'certifications': 'Certifications',
        'publications': 'Publications',
        'patents': 'Patents',
        'awards': 'Awards & Honors',
        'languages': 'Languages',
        'referees': 'References',
        'projects': 'Projects',
        'achievements': 'Achievements',
        'summary': 'Summary',
        'objective': 'Objective',
    };
    return mapping[sectionName] || sectionName.charAt(0).toUpperCase() + sectionName.slice(1);
}

/**
 * POST /api/import/cv/affinda
 * Upload and parse a CV file using Affinda API
 */
export async function POST(request: NextRequest) {
    const startTime = Date.now();
    
    try {
        if (!AFFINDA_API_KEY) {
            return NextResponse.json(
                { error: 'Affinda API key not configured' },
                { status: 500 }
            );
        }

        const formData = await request.formData();
        const file = formData.get('file') as File | null;

        if (!file) {
            return NextResponse.json(
                { error: 'No file provided' },
                { status: 400 }
            );
        }

        // Validate file type
        const allowedTypes = [
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/msword',
        ];

        if (!allowedTypes.includes(file.type)) {
            return NextResponse.json(
                { error: 'Invalid file type. Please upload a PDF or Word document.' },
                { status: 400 }
            );
        }

        // Get authenticated user
        const user = await getUserFromRequest(request);
        if (!user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        console.log(`[Affinda] Processing CV for user ${user.id}: ${file.name} (${file.size} bytes)`);

        // Get or create CV
        let cv = await prisma.cV.findUnique({
            where: { userId: user.id },
        });

        if (!cv) {
            cv = await prisma.cV.create({
                data: {
                    userId: user.id,
                    title: 'My CV',
                },
            });
        }

        // First, get organization, workspace, and collection
        console.log('[CV Parser] Setting up parsing service...');
        
        // Step 1: Get organization
        const orgRes = await fetch('https://api.affinda.com/v3/organizations', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${AFFINDA_API_KEY}`,
            },
        });
        
        if (!orgRes.ok) {
            const orgError = await orgRes.text();
            console.error('[CV Parser] Failed to get organizations:', orgError);
            return NextResponse.json(
                { error: 'Failed to connect to parsing service' },
                { status: 500 }
            );
        }
        
        const orgData = await orgRes.json();
        // API returns array directly, not { results: [...] }
        const organizations = Array.isArray(orgData) ? orgData : orgData.results || [];
        const organization = organizations[0];
        
        if (!organization) {
            console.error('[CV Parser] No organizations found. Response:', JSON.stringify(orgData));
            return NextResponse.json(
                { error: 'No organization found in parsing service' },
                { status: 500 }
            );
        }
        
        console.log('[CV Parser] Using organization:', organization.identifier);
        
        // Step 2: Get or find workspace
        const workspacesRes = await fetch(`https://api.affinda.com/v3/workspaces?organization=${organization.identifier}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${AFFINDA_API_KEY}`,
            },
        });
        
        let workspaceId: string | null = null;
        
        if (workspacesRes.ok) {
            const workspacesData = await workspacesRes.json();
            // API returns array directly
            const workspaces = Array.isArray(workspacesData) ? workspacesData : workspacesData.results || [];
            const workspace = workspaces[0];
            if (workspace) {
                workspaceId = workspace.identifier;
                console.log('[CV Parser] Using workspace:', workspaceId);
            }
        }
        
        if (!workspaceId) {
            // Create a workspace
            console.log('[CV Parser] Creating new workspace...');
            const createWsRes = await fetch('https://api.affinda.com/v3/workspaces', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${AFFINDA_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    organization: organization.identifier,
                    name: 'CV Creator',
                }),
            });
            
            if (createWsRes.ok) {
                const newWs = await createWsRes.json();
                workspaceId = newWs.identifier;
                console.log('[CV Parser] Created workspace:', workspaceId);
            } else {
                const wsError = await createWsRes.text();
                console.error('[CV Parser] Failed to create workspace:', wsError);
                return NextResponse.json(
                    { error: 'Failed to create parsing workspace' },
                    { status: 500 }
                );
            }
        }
        
        // Step 3: Get or create collection
        let collectionId: string | null = null;
        
        const collectionsRes = await fetch(`https://api.affinda.com/v3/collections?workspace=${workspaceId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${AFFINDA_API_KEY}`,
            },
        });
        
        if (collectionsRes.ok) {
            const collectionsData = await collectionsRes.json();
            // API returns array directly
            const collections = Array.isArray(collectionsData) ? collectionsData : collectionsData.results || [];
            // Find an existing resume collection
            const resumeCollection = collections.find(
                (c: { extractor?: string; identifier?: string }) => 
                    c.extractor === 'resume'
            );
            if (resumeCollection) {
                collectionId = resumeCollection.identifier;
                console.log('[CV Parser] Found existing collection:', collectionId);
            }
        }
        
        // If no collection found, create one
        if (!collectionId) {
            console.log('[CV Parser] Creating new resume collection...');
            
            const createCollRes = await fetch('https://api.affinda.com/v3/collections', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${AFFINDA_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: 'CV Imports',
                    workspace: workspaceId,
                    extractor: 'resume',
                }),
            });
            
            if (!createCollRes.ok) {
                const collError = await createCollRes.text();
                console.error('[CV Parser] Failed to create collection:', collError);
                return NextResponse.json(
                    { error: 'Failed to create parsing collection' },
                    { status: 500 }
                );
            }
            
            const newCollection = await createCollRes.json();
            collectionId = newCollection.identifier;
            console.log('[CV Parser] Created new collection:', collectionId);
        }
        
        // Now upload the document to the collection
        if (!collectionId) {
            return NextResponse.json(
                { error: 'Failed to get or create parsing collection' },
                { status: 500 }
            );
        }
        
        const affindaFormData = new FormData();
        affindaFormData.append('file', file);
        affindaFormData.append('collection', collectionId);
        affindaFormData.append('wait', 'true'); // Wait for processing to complete
        
        console.log('[CV Parser] Parsing CV...');
        
        const affindaResponse = await fetch('https://api.affinda.com/v3/documents', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${AFFINDA_API_KEY}`,
            },
            body: affindaFormData,
        });

        if (!affindaResponse.ok) {
            const errorText = await affindaResponse.text();
            console.error('[Affinda] API error:', affindaResponse.status, errorText);
            return NextResponse.json(
                { error: `Affinda API error: ${affindaResponse.status}` },
                { status: 500 }
            );
        }

        const affindaData = await affindaResponse.json();
        console.log('[Affinda] Response received in', Date.now() - startTime, 'ms');

        // Extract parsed data from Affinda response
        const data = affindaData.data || affindaData;
        
        // Log what Affinda returned for debugging
        console.log('[Affinda] Data keys:', Object.keys(data));
        if (data.publications) {
            console.log('[Affinda] Publications count:', data.publications.length);
        }
        if (data.sections) {
            console.log('[Affinda] Sections:', data.sections.map((s: {sectionType?: string}) => s.sectionType));
        }
        if (data.rawText) {
            console.log('[Affinda] Raw text length:', data.rawText.length);
        }
        
        // Update user profile from Affinda data
        const profileUpdate: Record<string, string | null> = {};
        if (data.name?.raw) profileUpdate.name = data.name.raw;
        if (data.phoneNumbers?.[0]?.raw) profileUpdate.phone = data.phoneNumbers[0].raw;
        if (data.location?.raw) profileUpdate.address = data.location.raw;
        if (data.websites?.[0]) profileUpdate.website = data.websites[0];
        
        // Try to extract institution from education or work experience
        if (data.education?.[0]?.organization) {
            profileUpdate.institution = data.education[0].organization;
        } else if (data.workExperience?.[0]?.organization) {
            profileUpdate.institution = data.workExperience[0].organization;
        }

        if (Object.keys(profileUpdate).length > 0) {
            await prisma.user.update({
                where: { id: user.id },
                data: profileUpdate,
            });
            console.log('[Affinda] Updated user profile:', Object.keys(profileUpdate));
        }

        // Prepare categories and entries from Affinda data
        interface ParsedEntry {
            title: string;
            description: string | null;
            date: string | null;
            location: string | null;
            url: string | null;
        }
        
        interface ParsedCategory {
            name: string;
            entries: ParsedEntry[];
        }
        
        const categories: ParsedCategory[] = [];

        // Work Experience
        if (data.workExperience && data.workExperience.length > 0) {
            categories.push({
                name: 'Professional Experience',
                entries: data.workExperience.map((exp: { jobTitle?: string; organization?: string; jobDescription?: string; dates?: { startDate?: string; endDate?: string }; location?: { raw?: string } }) => ({
                    title: exp.jobTitle || exp.organization || 'Position',
                    description: [exp.organization, exp.jobDescription].filter(Boolean).join(' - '),
                    date: exp.dates?.startDate || null,
                    location: exp.location?.raw || null,
                    url: null,
                })),
            });
        }

        // Education
        if (data.education && data.education.length > 0) {
            categories.push({
                name: 'Education',
                entries: data.education.map((edu: { accreditation?: { education?: string }; organization?: string; grade?: string; dates?: { completionDate?: string }; location?: { raw?: string } }) => ({
                    title: edu.accreditation?.education || edu.organization || 'Degree',
                    description: [edu.organization, edu.grade].filter(Boolean).join(' - '),
                    date: edu.dates?.completionDate || null,
                    location: edu.location?.raw || null,
                    url: null,
                })),
            });
        }

        // Skills
        if (data.skills && data.skills.length > 0) {
            categories.push({
                name: 'Skills',
                entries: data.skills.map((skill: { name?: string; type?: string }) => ({
                    title: skill.name || 'Skill',
                    description: skill.type || null,
                    date: null,
                    location: null,
                    url: null,
                })),
            });
        }

        // Certifications
        if (data.certifications && data.certifications.length > 0) {
            categories.push({
                name: 'Certifications',
                entries: data.certifications.map((cert: { name?: string }) => ({
                    title: cert.name || 'Certification',
                    description: null,
                    date: null,
                    location: null,
                    url: null,
                })),
            });
        }

        // Publications (if available)
        if (data.publications && data.publications.length > 0) {
            categories.push({
                name: 'Publications',
                entries: data.publications.map((pub: { title?: string; authors?: string; journal?: string; date?: string; doi?: string }) => ({
                    title: pub.title || 'Publication',
                    description: [pub.authors, pub.journal].filter(Boolean).join('. '),
                    date: pub.date || null,
                    location: null,
                    url: pub.doi || null,
                })),
            });
        }

        // Awards (if available in sections)
        if (data.sections) {
            for (const section of data.sections) {
                if (section.sectionType && section.text) {
                    const categoryName = mapAffindaSection(section.sectionType);
                    // Only add if not already covered
                    if (!categories.find(c => c.name === categoryName)) {
                        categories.push({
                            name: categoryName,
                            entries: [{
                                title: section.text.substring(0, 200),
                                description: section.text.length > 200 ? section.text : null,
                                date: null,
                                location: null,
                                url: null,
                            }],
                        });
                    }
                }
            }
        }

        // Raw sections - parse any additional sections Affinda found
        if (data.rawText) {
            // Extract sections from raw text using common CV headers
            const sectionHeaders = [
                'PUBLICATIONS', 'PEER-REVIEWED', 'PRESENTATIONS', 'GRANTS', 
                'AWARDS', 'HONORS', 'PATENTS', 'TEACHING', 'MENTORING',
                'SERVICE', 'COMMITTEES', 'LEADERSHIP', 'RESEARCH'
            ];
            
            const rawText = data.rawText;
            for (const header of sectionHeaders) {
                const regex = new RegExp(`\\b${header}\\b[:\\s]*([\\s\\S]*?)(?=\\b(?:${sectionHeaders.join('|')})\\b|$)`, 'i');
                const match = rawText.match(regex);
                if (match && match[1]) {
                    const content = match[1].trim();
                    if (content.length > 20) {
                        // Split by line breaks to get individual entries
                        const lines = content.split(/\n+/).filter((l: string) => l.trim().length > 10);
                        if (lines.length > 0) {
                            const categoryName = header.charAt(0) + header.slice(1).toLowerCase();
                            if (!categories.find(c => c.name.toUpperCase() === header)) {
                                categories.push({
                                    name: categoryName,
                                    entries: lines.slice(0, 50).map((line: string) => ({
                                        title: line.substring(0, 300),
                                        description: null,
                                        date: null,
                                        location: null,
                                        url: null,
                                    })),
                                });
                            }
                        }
                    }
                }
            }
        }

        console.log(`[Affinda] Parsed ${categories.length} categories`);

        // Get existing entries for deduplication
        const existingEntries = await prisma.entry.findMany({
            where: { category: { cvId: cv.id } },
            select: { title: true },
        });
        const normalizeTitle = (title: string) => title.toLowerCase().trim().replace(/\s+/g, ' ').slice(0, 100);
        const existingTitles = new Set(existingEntries.map(e => normalizeTitle(e.title)));

        let totalEntries = 0;

        // Save categories and entries to database
        for (const parsedCategory of categories) {
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
                console.log(`[Affinda] Created category: ${category.name}`);
            }

            // Create entries
            let skippedDuplicates = 0;
            for (const entry of parsedCategory.entries) {
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
                        title: entry.title,
                        description: entry.description,
                        date: parseDate(entry.date),
                        location: entry.location,
                        url: entry.url,
                        sourceType: 'affinda-import',
                        sourceData: {
                            originalCategory: parsedCategory.name,
                            importedAt: new Date().toISOString(),
                            parser: 'affinda',
                        },
                        displayOrder: (maxEntryOrder?.displayOrder ?? -1) + 1,
                    },
                });
                totalEntries++;
            }

            if (skippedDuplicates > 0) {
                console.log(`[Affinda] Skipped ${skippedDuplicates} duplicates in ${parsedCategory.name}`);
            }
        }

        const totalTime = Date.now() - startTime;
        console.log(`[Affinda] Complete! Created ${totalEntries} entries in ${totalTime}ms`);

        return NextResponse.json({
            success: true,
            message: `Imported ${categories.length} categories with ${totalEntries} new entries`,
            categoriesFound: categories.length,
            entriesCreated: totalEntries,
            processingTime: totalTime,
            categories: categories.map(c => ({
                name: c.name,
                entryCount: c.entries.length,
            })),
        });

    } catch (error) {
        console.error('[Affinda] Error:', error);
        return NextResponse.json(
            { error: String(error) },
            { status: 500 }
        );
    }
}

