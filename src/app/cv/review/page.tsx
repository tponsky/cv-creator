import prisma from '@/lib/prisma';
import { Navbar } from '@/components/Navbar';
import { ReviewQueue } from '@/components/ReviewQueue';

// Force dynamic rendering - don't prerender at build time
export const dynamic = 'force-dynamic';

// Get first user (demo mode - no auth)
async function getDemoUser() {
    return await prisma.user.findFirst();
}

export default async function ReviewPage() {
    const user = await getDemoUser();

    if (!user) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <p className="text-muted-foreground">No user found. Please visit the dashboard first.</p>
            </div>
        );
    }

    // Fetch pending entries
    const pendingEntries = await prisma.pendingEntry.findMany({
        where: {
            userId: user.id,
            status: 'pending',
        },
        orderBy: { createdAt: 'desc' },
    });

    // Fetch categories for assignment
    const cv = await prisma.cV.findUnique({
        where: { userId: user.id },
        include: {
            categories: {
                orderBy: { displayOrder: 'asc' },
            },
        },
    });

    const navUser = { id: user.id, name: user.name, email: user.email };

    return (
        <div className="min-h-screen bg-background">
            <Navbar user={navUser} />

            <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="mb-8">
                    <a href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-4">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        Back to Dashboard
                    </a>
                    <h1 className="text-3xl font-bold">Review Queue</h1>
                    <p className="text-muted-foreground">
                        Review and approve entries imported from PubMed or forwarded emails.
                    </p>
                </div>

                {pendingEntries.length === 0 ? (
                    <div className="card text-center py-12">
                        <svg className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <h3 className="text-lg font-medium mb-2">All caught up!</h3>
                        <p className="text-muted-foreground mb-4">
                            No pending entries to review.
                        </p>
                        <a href="/settings" className="btn-secondary inline-flex">
                            Import from PubMed →
                        </a>
                    </div>
                ) : (
                    <ReviewQueue
                        entries={pendingEntries.map(e => ({
                            id: e.id,
                            title: e.title,
                            description: e.description,
                            date: e.date ? e.date.toISOString() : null,
                            url: e.url,
                            sourceType: e.sourceType,
                            suggestedCategory: e.suggestedCategory,
                        }))}
                        categories={cv?.categories || []}
                    />
                )}
            </main>
        </div>
    );
}
