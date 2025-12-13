import prisma from '@/lib/prisma';
import Link from 'next/link';
import { Navbar } from '@/components/Navbar';

// Force dynamic rendering - don't prerender at build time
export const dynamic = 'force-dynamic';

// Default user for demo mode (no authentication)
async function getOrCreateDemoUser() {
    // Get first user or create one
    let user = await prisma.user.findFirst({
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

    if (!user) {
        // Create a demo user if none exists
        user = await prisma.user.create({
            data: {
                email: 'demo@cvbuilder.com',
                password: 'demo-password-not-used',
                name: 'Demo User',
                cv: {
                    create: {
                        title: 'My CV',
                        categories: {
                            create: [
                                { name: 'Education', displayOrder: 1 },
                                { name: 'Experience', displayOrder: 2 },
                                { name: 'Publications', displayOrder: 3 },
                                { name: 'Awards', displayOrder: 4 },
                            ],
                        },
                    },
                },
            },
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
    const user = await getOrCreateDemoUser();

    const pendingCount = user?.pendingEntries?.length || 0;
    const totalEntries = user?.cv?.categories?.reduce(
        (acc, cat) => acc + (cat.entries?.length || 0),
        0
    ) || 0;

    // Create a simple user object for the Navbar
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

                {/* Pending Entries Alert */}
                {pendingCount > 0 && (
                    <Link href="/cv/review">
                        <div className="mb-8 p-4 rounded-xl bg-gradient-to-r from-primary-500/20 to-accent-500/20 border border-primary-500/30 card-hover cursor-pointer">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-full bg-primary-500/30 flex items-center justify-center">
                                    <span className="text-xl font-bold text-primary-400">{pendingCount}</span>
                                </div>
                                <div className="flex-1">
                                    <h3 className="font-semibold text-primary-400">
                                        New entries to review
                                    </h3>
                                    <p className="text-sm text-muted-foreground">
                                        AI has suggested {pendingCount} new item{pendingCount > 1 ? 's' : ''} for your CV
                                    </p>
                                </div>
                                <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                            </div>
                        </div>
                    </Link>
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

                    <Link href="/cv/add" className="card card-hover flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-success/20 flex items-center justify-center">
                            <svg className="w-5 h-5 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                        </div>
                        <div>
                            <h3 className="font-medium">Add Entry</h3>
                            <p className="text-sm text-muted-foreground">New item</p>
                        </div>
                    </Link>

                    <Link href="/cv/bio" className="card card-hover flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-accent-500/20 flex items-center justify-center">
                            <svg className="w-5 h-5 text-accent-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                            </svg>
                        </div>
                        <div>
                            <h3 className="font-medium">Generate Bio</h3>
                            <p className="text-sm text-muted-foreground">AI-powered</p>
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
