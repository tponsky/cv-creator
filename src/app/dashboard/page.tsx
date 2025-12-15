import prisma from '@/lib/prisma';
import Link from 'next/link';
import { Navbar } from '@/components/Navbar';
import { requireAuth } from '@/lib/server-auth';

// Force dynamic rendering - don't prerender at build time
export const dynamic = 'force-dynamic';

// Get authenticated user with full CV data
async function getAuthenticatedUserWithData() {
    // This will redirect to /login if not authenticated
    const authUser = await requireAuth();

    // Fetch full user with CV and pending entries
    const user = await prisma.user.findUnique({
        where: { id: authUser.id },
        include: {
            cv: {
                include: {
                    categories: {
                        orderBy: { displayOrder: 'asc' },
                        include: {
                            entries: {
                                orderBy: { createdAt: 'desc' },
                                take: 3,
                            },
                        },
                    },
                },
            },
            pendingEntries: {
                where: { status: 'pending' },
                orderBy: { createdAt: 'desc' },
            },
        },
    });

    // If user exists but has no CV, create one
    if (user && !user.cv) {
        await prisma.cV.create({
            data: {
                userId: user.id,
                title: `${user.name || 'My'}'s CV`,
                categories: {
                    create: [
                        { name: 'Education', displayOrder: 0 },
                        { name: 'Experience', displayOrder: 1 },
                        { name: 'Publications', displayOrder: 2 },
                        { name: 'Presentations', displayOrder: 3 },
                        { name: 'Awards', displayOrder: 4 },
                    ],
                },
            },
        });
        // Re-fetch with new CV
        return prisma.user.findUnique({
            where: { id: authUser.id },
            include: {
                cv: {
                    include: {
                        categories: {
                            orderBy: { displayOrder: 'asc' },
                            include: {
                                entries: {
                                    orderBy: { createdAt: 'desc' },
                                    take: 3,
                                },
                            },
                        },
                    },
                },
                pendingEntries: {
                    where: { status: 'pending' },
                    orderBy: { createdAt: 'desc' },
                },
            },
        });
    }

    return user;
}

export default async function DashboardPage() {
    const user = await getAuthenticatedUserWithData();

    const pendingCount = user?.pendingEntries?.length || 0;
    const pendingBySource = {
        pubmed: user?.pendingEntries?.filter((e: { sourceType?: string }) => e.sourceType === 'pubmed').length || 0,
        email: user?.pendingEntries?.filter((e: { sourceType?: string }) => e.sourceType === 'email').length || 0,
        other: user?.pendingEntries?.filter((e: { sourceType?: string }) => !['pubmed', 'email'].includes(e.sourceType || '')).length || 0,
    };
    // Get the ACTUAL total entry count (not just the preview limit of 3 per category)
    const totalEntries = user?.cv?.id
        ? await prisma.entry.count({
            where: {
                category: {
                    cvId: user.cv.id,
                },
            },
        })
        : 0;

    // Create a simple user object for the Navbar
    if (!user) {
        // This shouldn't happen since requireAuth redirects, but handle edge case
        return null;
    }

    const navUser = {
        id: user.id,
        name: user.name,
        email: user.email,
    };

    return (
        <div className="min-h-screen bg-background">
            <Navbar user={navUser} />

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Welcome Section */}
                <div className="mb-8">
                    <h1 className="text-3xl font-bold mb-2">
                        Welcome back, {user.name?.split(' ')[0] || 'there'}!
                    </h1>
                    <p className="text-muted-foreground">
                        Manage your curriculum vitae and keep it up to date.
                    </p>
                </div>

                {/* New User Onboarding - Show if user has 0 entries */}
                {totalEntries === 0 && (
                    <div className="card mb-8 border-2 border-primary-500/30 bg-gradient-to-br from-primary-500/5 to-accent-500/5">
                        <div className="text-center mb-6">
                            <span className="text-4xl mb-4 block">🎉</span>
                            <h2 className="text-2xl font-bold mb-2">Let&apos;s Get Started!</h2>
                            <p className="text-muted-foreground">Follow these steps to set up your CV</p>
                        </div>

                        <div className="grid gap-4 md:grid-cols-3">
                            {/* Step 1 */}
                            <Link href="/settings" className="p-4 rounded-xl bg-secondary/50 hover:bg-secondary transition-colors group">
                                <div className="flex items-center gap-3 mb-2">
                                    <span className="w-8 h-8 rounded-full bg-primary-500/20 text-primary-400 flex items-center justify-center font-bold">1</span>
                                    <h3 className="font-semibold group-hover:text-primary-400">Upload Your CV</h3>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    Upload a PDF or Word document. Our AI will extract your experiences, publications, and more.
                                </p>
                            </Link>

                            {/* Step 2 */}
                            <Link href="/settings" className="p-4 rounded-xl bg-secondary/50 hover:bg-secondary transition-colors group">
                                <div className="flex items-center gap-3 mb-2">
                                    <span className="w-8 h-8 rounded-full bg-accent-500/20 text-accent-400 flex items-center justify-center font-bold">2</span>
                                    <h3 className="font-semibold group-hover:text-accent-400">Import PubMed</h3>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    Have publications? Search by your name to import them automatically.
                                </p>
                            </Link>

                            {/* Step 3 */}
                            <div className="p-4 rounded-xl bg-secondary/50">
                                <div className="flex items-center gap-3 mb-2">
                                    <span className="w-8 h-8 rounded-full bg-success/20 text-success flex items-center justify-center font-bold">3</span>
                                    <h3 className="font-semibold">Forward Emails</h3>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    Got an award notification? Forward it to <span className="font-mono text-xs">cv@resend.cv-creator.com</span>
                                </p>
                            </div>
                        </div>

                        <div className="mt-6 text-center">
                            <Link href="/settings" className="btn-primary">
                                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                </svg>
                                Start by Uploading Your CV
                            </Link>
                        </div>
                    </div>
                )}
                {/* Updates to Review Section */}
                {pendingCount > 0 && (
                    <div className="mb-8 p-6 rounded-xl bg-gradient-to-r from-primary-500/10 to-accent-500/10 border border-primary-500/30">
                        <div className="flex items-start gap-4 mb-4">
                            <div className="w-12 h-12 rounded-full bg-primary-500/30 flex items-center justify-center flex-shrink-0">
                                <span className="text-xl font-bold text-primary-400">{pendingCount}</span>
                            </div>
                            <div className="flex-1">
                                <h3 className="text-lg font-semibold text-primary-400 mb-1">
                                    Updates to Review
                                </h3>
                                <p className="text-sm text-muted-foreground">
                                    AI has found {pendingCount} new item{pendingCount > 1 ? 's' : ''} for your CV
                                </p>
                            </div>
                        </div>

                        {/* Categorized Breakdown */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                            {pendingBySource.pubmed > 0 && (
                                <div className="flex items-center gap-3 p-3 rounded-lg bg-background/50 border border-border">
                                    <span className="text-2xl">📚</span>
                                    <div className="flex-1">
                                        <p className="font-medium text-sm">PubMed Publications</p>
                                        <p className="text-xs text-muted-foreground">
                                            {pendingBySource.pubmed} new publication{pendingBySource.pubmed > 1 ? 's' : ''} found
                                        </p>
                                    </div>
                                </div>
                            )}
                            {pendingBySource.email > 0 && (
                                <div className="flex items-center gap-3 p-3 rounded-lg bg-background/50 border border-border">
                                    <span className="text-2xl">📧</span>
                                    <div className="flex-1">
                                        <p className="font-medium text-sm">From Forwarded Emails</p>
                                        <p className="text-xs text-muted-foreground">
                                            {pendingBySource.email} suggested entr{pendingBySource.email > 1 ? 'ies' : 'y'}
                                        </p>
                                    </div>
                                </div>
                            )}
                            {pendingBySource.other > 0 && (
                                <div className="flex items-center gap-3 p-3 rounded-lg bg-background/50 border border-border">
                                    <span className="text-2xl">📄</span>
                                    <div className="flex-1">
                                        <p className="font-medium text-sm">Other Sources</p>
                                        <p className="text-xs text-muted-foreground">
                                            {pendingBySource.other} item{pendingBySource.other > 1 ? 's' : ''} to review
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>

                        <Link
                            href="/cv/review"
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white font-medium text-sm transition-colors"
                        >
                            Review All Entries
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                        </Link>
                    </div>
                )}

                {/* Quick Stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <div className="card">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-lg bg-primary-500/20 flex items-center justify-center">
                                <svg className="w-6 h-6 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{totalEntries}</p>
                                <p className="text-sm text-muted-foreground">CV Entries</p>
                            </div>
                        </div>
                    </div>

                    <div className="card">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-lg bg-accent-500/20 flex items-center justify-center">
                                <svg className="w-6 h-6 text-accent-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{user?.cv?.categories?.length || 0}</p>
                                <p className="text-sm text-muted-foreground">Categories</p>
                            </div>
                        </div>
                    </div>

                    <div className="card">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-lg bg-warning/20 flex items-center justify-center">
                                <svg className="w-6 h-6 text-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{pendingCount}</p>
                                <p className="text-sm text-muted-foreground">Pending Review</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Quick Actions */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <Link href="/cv" className="card card-hover flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-primary-500/20 flex items-center justify-center">
                            <svg className="w-5 h-5 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                        </div>
                        <div>
                            <h3 className="font-medium">Edit CV</h3>
                            <p className="text-sm text-muted-foreground">Manage entries</p>
                        </div>
                    </Link>

                    <Link href="/settings" className="card card-hover flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                            <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        </div>
                        <div>
                            <h3 className="font-medium">Settings</h3>
                            <p className="text-sm text-muted-foreground">Preferences</p>
                        </div>
                    </Link>
                </div>

                {/* Recent Entries */}
                <div className="card">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-semibold">Recent Entries</h2>
                        <Link href="/cv" className="text-sm text-primary-400 hover:text-primary-300">
                            View all →
                        </Link>
                    </div>

                    {user?.cv?.categories?.some(cat => cat.entries.length > 0) ? (
                        <div className="space-y-4">
                            {user.cv.categories
                                .flatMap(cat => cat.entries.map(entry => ({ ...entry, categoryName: cat.name })))
                                .slice(0, 5)
                                .map((entry) => (
                                    <div
                                        key={entry.id}
                                        className="flex items-start gap-4 p-4 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
                                    >
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium truncate">{entry.title}</p>
                                            <p className="text-sm text-muted-foreground truncate">
                                                {entry.categoryName}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className={`badge ${entry.sourceType === 'manual' ? 'badge-primary' :
                                                entry.sourceType === 'pubmed' ? 'badge-success' :
                                                    'badge-warning'
                                                }`}>
                                                {entry.sourceType}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                        </div>
                    ) : (
                        <div className="text-center py-12 text-muted-foreground">
                            <svg className="w-12 h-12 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <p>No entries yet. Start building your CV!</p>
                            <Link href="/cv/add" className="btn-primary mt-4 inline-flex">
                                Add your first entry
                            </Link>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
