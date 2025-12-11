import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { Navbar } from '@/components/Navbar';
import { EntryForm } from '@/components/EntryForm';

interface PageProps {
    searchParams: { category?: string };
}

export default async function AddEntryPage({ searchParams }: PageProps) {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
        redirect('/login');
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
                    <h1 className="text-3xl font-bold">Add New Entry</h1>
                    <p className="text-muted-foreground">Add a new item to your CV</p>
                </div>

                <div className="card">
                    <EntryForm
                        categories={cv.categories}
                        defaultCategoryId={searchParams.category}
                    />
                </div>
            </main>
        </div>
    );
}
