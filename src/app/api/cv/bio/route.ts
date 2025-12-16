import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getUserFromRequest } from '@/lib/server-auth';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

interface Category {
    name: string;
    entries: { title: string; description: string | null }[];
}

/**
 * GET /api/cv/bio
 * Get the current user's bio
 */
export async function GET(request: NextRequest) {
    const authUser = await getUserFromRequest(request);
    if (!authUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
        where: { id: authUser.id },
        select: { bio: true },
    });

    return NextResponse.json({ bio: user?.bio || '' });
}

/**
 * POST /api/cv/bio
 * Generate a professional bio using AI based on CV entries
 */
export async function POST(request: NextRequest) {
    const authUser = await getUserFromRequest(request);
    if (!authUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { length = 'medium', highlights = '' } = await request.json();

    // Fetch full user with CV data
    const user = await prisma.user.findUnique({
        where: { id: authUser.id },
        include: {
            cv: {
                include: {
                    categories: {
                        include: {
                            entries: {
                                orderBy: { date: 'desc' },
                                take: 20,
                            },
                        },
                    },
                },
            },
        },
    });

    if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (!user.cv || user.cv.categories.length === 0) {
        return NextResponse.json({
            error: 'No CV data found. Please add some entries first.'
        }, { status: 400 });
    }

    // Build context from CV entries
    const cvContext = user.cv.categories.map((cat: Category) => {
        const entries = cat.entries.map((e: { title: string; description: string | null }) =>
            `- ${e.title}${e.description ? ': ' + e.description.substring(0, 200) : ''}`
        ).join('\n');
        return `## ${cat.name}\n${entries || '(No entries)'}`;
    }).join('\n\n');

    const lengthInstructions = {
        short: 'Write a concise 2-3 sentence bio (about 50-75 words).',
        medium: 'Write a professional bio of about 100-150 words.',
        long: 'Write a comprehensive professional bio of about 200-250 words.',
    };

    const highlightsInstruction = highlights
        ? `\nIMPORTANT: The user wants you to specifically emphasize the following in their bio: ${highlights}`
        : '';

    const systemPrompt = `You are a professional bio writer for academics and medical professionals.
Create a compelling professional biography based on the CV information provided.
Write in third person. Focus on key accomplishments, expertise, and career highlights.
${lengthInstructions[length as keyof typeof lengthInstructions] || lengthInstructions.medium}${highlightsInstruction}
Do not make up any information - only use what's provided in the CV.`;

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: systemPrompt },
                    {
                        role: 'user',
                        content: `Generate a professional biography for ${user.name || 'this professional'}${user.institution ? ` at ${user.institution}` : ''}.\n\n${cvContext}`
                    },
                ],
                temperature: 0.7,
                max_tokens: 500,
            }),
        });

        if (!response.ok) {
            throw new Error(`OpenAI API error: ${response.status}`);
        }

        const data = await response.json();
        const generatedBio = data.choices?.[0]?.message?.content?.trim() || '';

        return NextResponse.json({
            bio: generatedBio,
            success: true,
        });
    } catch (error) {
        console.error('Bio generation error:', error);
        return NextResponse.json({
            error: 'Failed to generate bio. Please try again.'
        }, { status: 500 });
    }
}

/**
 * PUT /api/cv/bio
 * Save the user's bio
 */
export async function PUT(request: NextRequest) {
    const authUser = await getUserFromRequest(request);
    if (!authUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { bio } = await request.json();

    if (typeof bio !== 'string') {
        return NextResponse.json({ error: 'Bio must be a string' }, { status: 400 });
    }

    await prisma.user.update({
        where: { id: authUser.id },
        data: { bio },
    });

    return NextResponse.json({ success: true, bio });
}
