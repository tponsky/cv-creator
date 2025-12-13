import prisma from '@/lib/prisma';
import { Navbar } from '@/components/Navbar';
import { CVEditor } from '@/components/CVEditor';

// Get first user from database (demo mode - no auth)
async function getDemoUser() {
    const user = await prisma.user.findFirst();
    return user;
}

export default async function CVPage() {
    const user = await getDemoUser();

    if (!user) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <p className="text-muted-foreground">No user found. Please visit the dashboard first to create a demo account.</p>
            </div>
        );
    }

    // Fetch user's CV with all categories and entries
    const cv = await prisma.cV.findUnique({
        where: { userId: user.id },
        include: {
            categories: {
                orderBy: { displayOrder: 'asc' },
                include: {
                    entries: {
                        orderBy: [
                            { date: 'desc' },
                            { createdAt: 'desc' },
                        ],
                    },
                },
            },
        },
    });

    if (!cv) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <p className="text-muted-foreground">No CV found. Please visit the dashboard first.</p>
            </div>
        );
    }

    const navUser = { id: user.id, name: user.name, email: user.email };

    return (
        <div className="min-h-screen bg-background">
            <Navbar user={navUser} />

            <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-bold">{cv.title}</h1>
                        <p className="text-muted-foreground">
                            {cv.categories.length} categories • {cv.categories.reduce((acc, cat) => acc + cat.entries.length, 0)} entries
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <a href="/cv/add" className="btn-primary">
                            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Add Entry
                        </a>
                    </div>
                </div>

                <CVEditor cv={cv} />
            </main>
        </div>
    );
}
