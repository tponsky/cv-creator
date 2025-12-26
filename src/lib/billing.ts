/**
 * Billing utilities for tracking usage and managing credits
 */

import prisma from '@/lib/prisma';

// Pricing constants (cost per operation in USD)
export const PRICING = {
    CV_PARSE_PER_CHUNK: 0.02,    // $0.02 per chunk parsed
    PUBMED_SEARCH: 0.01,         // $0.01 per PubMed search
    BIO_GENERATE: 0.05,          // $0.05 per bio generation
    PMID_ENRICH: 0.005,          // $0.005 per PMID enrichment
};

export const MINIMUM_BALANCE = 0.01; // Minimum balance to perform operations
export const LOW_BALANCE_WARNING = 0.50; // Show warning when below this

/**
 * Check if user has sufficient balance
 */
export async function checkBalance(userId: string, requiredAmount: number = MINIMUM_BALANCE): Promise<{
    hasBalance: boolean;
    currentBalance: number;
    needsReload: boolean;
}> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { balanceUsd: true },
    });

    const currentBalance = user?.balanceUsd || 0;

    return {
        hasBalance: currentBalance >= requiredAmount,
        currentBalance,
        needsReload: currentBalance < LOW_BALANCE_WARNING,
    };
}

/**
 * Deduct cost from user's balance and log usage
 */
export async function deductAndLog(
    userId: string,
    action: string,
    costUsd: number,
    details?: string
): Promise<{ success: boolean; newBalance: number; error?: string }> {
    try {
        // Check current balance
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { balanceUsd: true },
        });

        if (!user) {
            return { success: false, newBalance: 0, error: 'User not found' };
        }

        const currentBalance = user.balanceUsd || 0;

        if (currentBalance < costUsd) {
            return { 
                success: false, 
                newBalance: currentBalance, 
                error: 'Insufficient balance. Please add credits.' 
            };
        }

        // Deduct balance and log in a transaction
        const [updatedUser] = await prisma.$transaction([
            prisma.user.update({
                where: { id: userId },
                data: { balanceUsd: { decrement: costUsd } },
                select: { balanceUsd: true },
            }),
            prisma.usage.create({
                data: {
                    userId,
                    action,
                    costUsd,
                    details,
                },
            }),
        ]);

        return {
            success: true,
            newBalance: updatedUser.balanceUsd || 0,
        };

    } catch (error) {
        console.error('[Billing] Deduct error:', error);
        return { success: false, newBalance: 0, error: String(error) };
    }
}

/**
 * Get user's current balance
 */
export async function getBalance(userId: string): Promise<number> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { balanceUsd: true },
    });
    return user?.balanceUsd || 0;
}

/**
 * Add credits to user's balance (used after Stripe payment)
 */
export async function addCredits(userId: string, amountUsd: number, details?: string): Promise<number> {
    const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: { balanceUsd: { increment: amountUsd } },
        select: { balanceUsd: true },
    });

    // Log the deposit
    await prisma.usage.create({
        data: {
            userId,
            action: 'deposit',
            costUsd: 0,
            details: details || `Added $${amountUsd.toFixed(2)} credits`,
        },
    });

    return updatedUser.balanceUsd || 0;
}

