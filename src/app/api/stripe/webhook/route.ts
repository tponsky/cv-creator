import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
    apiVersion: '2023-10-16',
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

/**
 * POST /api/stripe/webhook
 * Handle Stripe webhook events
 */
export async function POST(request: NextRequest) {
    try {
        const payload = await request.text();
        const signature = request.headers.get('stripe-signature');

        if (!signature) {
            console.error('[Webhook] No signature provided');
            return NextResponse.json({ error: 'No signature' }, { status: 400 });
        }

        if (!webhookSecret) {
            console.error('[Webhook] STRIPE_WEBHOOK_SECRET not configured');
            return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
        }

        let event: Stripe.Event;

        try {
            event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
        } catch (err) {
            console.error('[Webhook] Signature verification failed:', err);
            return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
        }

        console.log(`[Webhook] Received event: ${event.type}`);

        // Handle checkout.session.completed
        if (event.type === 'checkout.session.completed') {
            const session = event.data.object as Stripe.Checkout.Session;
            const sessionId = session.id;

            console.log(`[Webhook] Processing checkout.session.completed: ${sessionId}`);

            try {
                // Get user ID from metadata
                const userId = session.metadata?.userId;
                if (!userId) {
                    console.error(`[Webhook] No userId in metadata for session ${sessionId}`);
                    
                    // Try fallback by customer email
                    const customerEmail = session.customer_details?.email;
                    if (customerEmail) {
                        const user = await prisma.user.findUnique({ where: { email: customerEmail } });
                        if (user) {
                            await processPayment(user.id, session);
                            return NextResponse.json({ status: 'success' });
                        }
                    }
                    return NextResponse.json({ error: 'User not found' }, { status: 400 });
                }

                await processPayment(userId, session);

            } catch (error) {
                console.error(`[Webhook] Error processing payment:`, error);
                // Return success so Stripe doesn't retry
                return NextResponse.json({ status: 'error', message: String(error) });
            }
        }

        return NextResponse.json({ status: 'success' });

    } catch (error) {
        console.error('[Webhook] Error:', error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}

async function processPayment(userId: string, session: Stripe.Checkout.Session) {
    // Get amount from session (source of truth)
    const amountUsd = (session.amount_total || 0) / 100;

    console.log(`[Webhook] Adding $${amountUsd.toFixed(2)} to user ${userId}`);

    // Get balance before
    const userBefore = await prisma.user.findUnique({
        where: { id: userId },
        select: { balanceUsd: true },
    });

    // Add to balance
    await prisma.user.update({
        where: { id: userId },
        data: {
            balanceUsd: { increment: amountUsd },
        },
    });

    // Get balance after
    const userAfter = await prisma.user.findUnique({
        where: { id: userId },
        select: { balanceUsd: true },
    });

    // Log the deposit
    await prisma.usage.create({
        data: {
            userId,
            action: 'deposit',
            costUsd: 0, // Deposits don't cost anything
            details: `Stripe deposit: $${amountUsd.toFixed(2)} (session: ${session.id})`,
        },
    });

    console.log(`[Webhook] Balance updated: $${userBefore?.balanceUsd?.toFixed(2)} -> $${userAfter?.balanceUsd?.toFixed(2)}`);
}

