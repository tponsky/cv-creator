import { redirect } from 'next/navigation';
import prisma from '@/lib/prisma';
import { Navbar } from '@/components/Navbar';
import { EntryForm } from '@/components/EntryForm';

// Force dynamic rendering - don't prerender at build time
export const dynamic = 'force-dynamic';

interface PageProps {
    params: { id: string };
}

// Get first user (demo mode - no auth)
async function getDemoUser() {
    return await prisma.user.findFirst();
}

export default async function EditEntryPage({ params }: PageProps) {
    const user = await getDemoUser();

    if (!user) {
        redirect('/dashboard');
    }

    // Fetch the entry
    const entry = await prisma.entry.findFirst({
        where: {
            id: params.id,
            category: {
                cv: { userId: user.id },
            },
        },
    });

    if (!entry) {
        redirect('/cv');
    }

    // Fetch user's categories
    const cv = await prisma.cV.findUnique({
        where: { userId: user.id },
        include: {
            categories: {
                orderBy: { displayOrder: 'asc' },
            },
        },
    });

    if (!cv) {
        redirect('/dashboard');
    }

    const navUser = { id: user.id, name: user.name, email: user.email };

    // Convert dates to strings for the form
    const entryWithStringDates = {
        ...entry,
        date: entry.date?.toISOString() || null,
        endDate: entry.endDate?.toISOString() || null,
    };

    return (
        <div className="min-h-screen bg-background">
            <Navbar user={navUser} />

            <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="mb-8">
                    <a href="/cv" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-4">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        Back to CV
                    </a>
                    <h1 className="text-3xl font-bold">Edit Entry</h1>
                    <p className="text-muted-foreground">Update this CV entry</p>
                </div>

                <div className="card">
                    <EntryForm
                        categories={cv.categories}
                        entry={entryWithStringDates}
                    />
                </div>
            </main>
        </div>
    );
}
