import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { hashSync } from 'bcryptjs';
import { createToken, AUTH_COOKIE_OPTIONS } from '@/lib/jwt';
import { serialize } from 'cookie';

type ResponseData = {
    message?: string;
    error?: string;
    user?: {
        id: string;
        email: string;
        name: string | null;
    };
    token?: string;
};

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse<ResponseData>
) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { name, email, password, institution } = req.body;

        // Validation
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        if (password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }

        // Check if user already exists
        const existingUser = await prisma.user.findUnique({
            where: { email },
        });

        if (existingUser) {
            return res.status(400).json({ error: 'An account with this email already exists' });
        }

        // Hash password
        const hashedPassword = hashSync(password, 10);

        // Create user
        const user = await prisma.user.create({
            data: {
                name: name || null,
                email,
                password: hashedPassword,
                institution: institution || null,
            },
        });

        // Create JWT token
        const token = await createToken({
            id: user.id,
            email: user.email,
            name: user.name || undefined,
        });

        // Set auth cookie
        res.setHeader('Set-Cookie', serialize('auth-token', token, {
            ...AUTH_COOKIE_OPTIONS,
            sameSite: AUTH_COOKIE_OPTIONS.sameSite as 'lax' | 'strict' | 'none',
        }));

        return res.status(201).json({
            message: 'Account created successfully',
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
            },
            token,
        });
    } catch (error) {
        console.error('Registration error:', error);
        return res.status(500).json({ error: 'An error occurred during registration' });
    }
}
