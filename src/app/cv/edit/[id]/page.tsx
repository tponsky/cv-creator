import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { Navbar } from '@/components/Navbar';
import { EntryForm } from '@/components/EntryForm';

interface PageProps {
    params: { id: string };
}

export default async function EditEntryPage({ params }: PageProps) {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
        redirect('/login');
    }

    // Fetch the entry
    const entry = await prisma.entry.findFirst({
        where: {
            id: params.id,
            category: {
                cv: { userId: session.user.id },
            },
        },
    });

    if (!entry) {
        redirect('/cv');
    }

    // Fetch user's categories
    const cv = await prisma.cV.findUnique({
        where: { userId: session.user.id },
        include: {
            categories: {
                orderBy: { displayOrder: 'asc' },
            },
        },
    });

    if (!cv) {
        redirect('/dashboard');
    }

    // Convert dates to strings for the form
    const entryWithStringDates = {
        ...entry,
        date: entry.date?.toISOString() || null,
        endDate: entry.endDate?.toISOString() || null,
    };

    return (
        <div className="min-h-screen bg-background">
            <Navbar user={session.user} />

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
