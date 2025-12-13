import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { email, password, name } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        // Just check if user exists - no creation
        const existingUser = await prisma.user.findUnique({
            where: { email },
        });

        if (existingUser) {
            return res.status(200).json({
                status: 'User already exists',
                email: existingUser.email
            });
        }

        return res.status(200).json({
            status: 'User not found - ready to create',
            receivedEmail: email,
            receivedName: name
        });
    } catch (error) {
        console.error('Register error:', error);
        return res.status(500).json({ error: 'An error occurred' });
    }
}
