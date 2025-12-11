import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export default async function Home() {
    const session = await getServerSession(authOptions);

    if (session) {
        redirect('/dashboard');
    }

    return (
        <main className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden">
            {/* Background Effects */}
            <div className="absolute inset-0 bg-gradient-to-br from-primary-900/20 via-background to-accent-900/20" />
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary-500/10 rounded-full blur-3xl" />
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent-500/10 rounded-full blur-3xl" />

            <div className="relative z-10 text-center px-4 max-w-4xl mx-auto">
                {/* Logo/Icon */}
                <div className="mb-8 flex justify-center">
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center shadow-xl glow">
                        <svg
                            className="w-12 h-12 text-white"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                            />
                        </svg>
                    </div>
                </div>

                {/* Title */}
                <h1 className="text-5xl md:text-7xl font-bold mb-6">
                    <span className="gradient-text">CV Creator</span>
                </h1>

                {/* Subtitle */}
                <p className="text-xl md:text-2xl text-muted-foreground mb-4 max-w-2xl mx-auto">
                    Intelligent CV Management
                </p>
                <p className="text-lg text-muted-foreground/80 mb-12 max-w-xl mx-auto">
                    Automatically build and maintain your curriculum vitae with AI-powered content analysis from publications, calendars, and more.
                </p>

                {/* Features */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                    <div className="card glass card-hover">
                        <div className="w-12 h-12 rounded-lg bg-primary-500/20 flex items-center justify-center mb-4 mx-auto">
                            <svg className="w-6 h-6 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                        </div>
                        <h3 className="font-semibold mb-2">Auto-Import</h3>
                        <p className="text-sm text-muted-foreground">PubMed, calendars, emails, and links</p>
                    </div>
                    <div className="card glass card-hover">
                        <div className="w-12 h-12 rounded-lg bg-accent-500/20 flex items-center justify-center mb-4 mx-auto">
                            <svg className="w-6 h-6 text-accent-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                            </svg>
                        </div>
                        <h3 className="font-semibold mb-2">AI-Powered</h3>
                        <p className="text-sm text-muted-foreground">Smart categorization that learns your preferences</p>
                    </div>
                    <div className="card glass card-hover">
                        <div className="w-12 h-12 rounded-lg bg-success/20 flex items-center justify-center mb-4 mx-auto">
                            <svg className="w-6 h-6 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                        </div>
                        <h3 className="font-semibold mb-2">Bio Generator</h3>
                        <p className="text-sm text-muted-foreground">One-click professional bio creation</p>
                    </div>
                </div>

                {/* CTA Buttons */}
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                    <Link
                        href="/register"
                        className="btn-primary text-lg px-8 py-4 glow"
                    >
                        Get Started Free
                    </Link>
                    <Link
                        href="/login"
                        className="btn-secondary text-lg px-8 py-4"
                    >
                        Sign In
                    </Link>
                </div>
            </div>
        </main>
    );
}
