import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';

async function diagnose() {
    console.log('--- DIAGNOSING API KEYS ---');

    // Gemini
    if (process.env.GEMINI_API_KEY) {
        console.log('\n--- GEMINI ---');
        try {
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
            // Note: The SDK doesn't have a direct listModels, we usually use the REST API or just try a few
            console.log('Trying to fetch model list via REST...');
            const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
            const data = await resp.json();
            if (data.models) {
                console.log('Available Gemini Models:');
                data.models.forEach((m: any) => console.log(` - ${m.name} (supports: ${m.supportedGenerationMethods})`));
            } else {
                console.log('No models returned or error:', JSON.stringify(data));
            }
        } catch (e: any) {
            console.error('Gemini diagnostic failed:', e.message);
        }
    } else {
        console.log('GEMINI_API_KEY missing');
    }

    // Anthropic
    if (process.env.ANTHROPIC_API_KEY) {
        console.log('\n--- ANTHROPIC ---');
        try {
            const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
            console.log('Anthropic doesn\'t support listing models via SDK easily. Trying a small test message with claude-3-haiku-20240307...');
            const msg = await anthropic.messages.create({
                model: "claude-3-haiku-20240307",
                max_tokens: 10,
                messages: [{ role: "user", content: "hi" }],
            });
            console.log('Haiku test success:', msg.content[0]);

            console.log('Trying claude-3-5-son-latest...');
            try {
                const msg2 = await anthropic.messages.create({
                    model: "claude-3-5-sonnet-latest",
                    max_tokens: 10,
                    messages: [{ role: "user", content: "hi" }],
                });
                console.log('Sonnet latest test success:', msg2.content[0]);
            } catch (e: any) {
                console.error('Sonnet latest failed:', e.message);
            }
        } catch (e: any) {
            console.error('Anthropic diagnostic failed:', e.message);
        }
    } else {
        console.log('ANTHROPIC_API_KEY missing');
    }
}

diagnose();
