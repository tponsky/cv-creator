import prisma from '@/lib/prisma';
import { Navbar } from '@/components/Navbar';
import { CVEditor } from '@/components/CVEditor';
import { ExportModal } from '@/components/ExportModal';
import { RecentDropdown } from '@/components/RecentDropdown';
import { requireAuth } from '@/lib/server-auth';
import Link from 'next/link';

// Force dynamic rendering - don't prerender at build time
export const dynamic = 'force-dynamic';

export default async function CVPage() {
    // Require authentication
    const authUser = await requireAuth();

    // Fetch full user with profile and CV
    const user = await prisma.user.findUnique({
        where: { id: authUser.id },
        include: {
            cv: {
                include: {
                    categories: {
                        orderBy: { displayOrder: 'asc' },
                        include: {
                            entries: {
                                orderBy: { displayOrder: 'asc' },
                            },
                        },
                    },
                },
            },
        },
    });

    if (!user) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <p className="text-muted-foreground">User not found. Please log in again.</p>
            </div>
        );
    }

    const cv = user.cv;

    if (!cv) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <p className="text-muted-foreground">No CV found. Please visit the dashboard first.</p>
            </div>
        );
    }

    const navUser = { id: user.id, name: user.name, email: user.email };
    const totalEntries = cv.categories.reduce((acc, cat) => acc + cat.entries.length, 0);

    return (
        <div className="min-h-screen bg-background">
            <Navbar user={navUser} />

            <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-bold">{cv.title}</h1>
                        <div className="flex items-center gap-3 mt-1">
                            <span className="text-lg font-semibold text-primary-400">{cv.categories.length} categories</span>
                            <span className="text-muted-foreground">•</span>
                            <span className="text-lg font-semibold text-primary-400">{totalEntries} entries</span>
                            <span className="text-muted-foreground">•</span>
                            <RecentDropdown />
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <a href="/cv/bio" className="btn-secondary flex items-center gap-2">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            Create Bio
                        </a>
                        <ExportModal />
                    </div>
                </div>

                {/* Personal Information Header - CV Style */}
                <div className="card mb-6 text-center">
                    <h2 className="text-2xl font-bold mb-1">{user.name || 'Your Name'}</h2>
                    {user.institution && (
                        <p className="text-lg text-muted-foreground mb-2">{user.institution}</p>
                    )}
                    <div className="flex flex-wrap justify-center gap-4 text-sm text-muted-foreground">
                        {user.email && (
                            <span className="flex items-center gap-1">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                </svg>
                                {user.email}
                            </span>
                        )}
                        {user.phone && (
                            <span className="flex items-center gap-1">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                </svg>
                                {user.phone}
                            </span>
                        )}
                        {user.address && (
                            <span className="flex items-center gap-1">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                {user.address}
                            </span>
                        )}
                        {user.website && (
                            <a href={user.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary-400 hover:text-primary-300">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                                </svg>
                                {user.website}
                            </a>
                        )}
                    </div>
                    {(!user.phone && !user.address && !user.website) && (
                        <p className="text-sm text-muted-foreground mt-2">
                            <Link href="/settings" className="text-primary-400 hover:text-primary-300">
                                Add your contact info in Settings →
                            </Link>
                        </p>
                    )}
                </div>

                <CVEditor cv={cv} />
            </main>
        </div>
    );
}

