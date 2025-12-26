import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import prisma from '@/lib/prisma';
import { getUserFromRequest } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
    apiVersion: '2023-10-16',
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://cv.staycurrentai.com';
const RELOAD_AMOUNT = 10.00; // $10 per reload

/**
 * POST /api/stripe/checkout
 * Create a Stripe checkout session for adding credits
 */
export async function POST(request: NextRequest) {
    try {
        if (!process.env.STRIPE_SECRET_KEY) {
            return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
        }

        const user = await getUserFromRequest(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get full user with stripe customer ID
        const dbUser = await prisma.user.findUnique({
            where: { id: user.id },
            select: { id: true, email: true, stripeCustomerId: true },
        });

        if (!dbUser) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        let customerId = dbUser.stripeCustomerId;

        // Create Stripe customer if doesn't exist
        if (!customerId) {
            const customer = await stripe.customers.create({
                email: dbUser.email,
                metadata: { userId: dbUser.id },
            });
            customerId = customer.id;

            // Save customer ID
            await prisma.user.update({
                where: { id: dbUser.id },
                data: { stripeCustomerId: customerId },
            });
        }

        // Create checkout session
        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: 'CV Creator Credits',
                        description: '$10 worth of AI-powered CV parsing and updates',
                    },
                    unit_amount: Math.round(RELOAD_AMOUNT * 100), // Convert to cents
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: `${APP_URL}/settings?payment=success`,
            cancel_url: `${APP_URL}/settings?payment=cancelled`,
            metadata: {
                userId: dbUser.id,
                amountUsd: String(RELOAD_AMOUNT),
            },
        });

        return NextResponse.json({ sessionUrl: session.url });

    } catch (error) {
        console.error('[Stripe Checkout] Error:', error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}

