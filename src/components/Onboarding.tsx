'use client';

import { useState } from 'react';
import Link from 'next/link';

interface OnboardingProps {
    userName: string;
    onDismiss?: () => void;
}

export function Onboarding({ userName, onDismiss }: OnboardingProps) {
    const [currentStep, setCurrentStep] = useState(0);

    const steps = [
        {
            title: `Welcome, ${userName}!`,
            icon: '👋',
            content: (
                <div className="space-y-4">
                    <p className="text-lg">
                        Let&apos;s set up your CV in just a few steps. This will only take a minute!
                    </p>
                    <p className="text-muted-foreground">
                        Your CV data is securely stored and you can access it anytime to update, export, or generate career documents.
                    </p>
                </div>
            ),
        },
        {
            title: 'Step 1: Upload Your CV',
            icon: '📄',
            content: (
                <div className="space-y-4">
                    <p>
                        Start by uploading your existing CV. Our AI will automatically:
                    </p>
                    <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                        <li>Extract all your experiences, education, and achievements</li>
                        <li>Organize them into categories</li>
                        <li>Fill in your profile information</li>
                    </ul>
                    <Link
                        href="/settings"
                        className="btn-primary inline-flex items-center gap-2 mt-4"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        Go to Settings to Upload CV
                    </Link>
                </div>
            ),
        },
        {
            title: 'Step 2: Connect PubMed (Optional)',
            icon: '🔬',
            content: (
                <div className="space-y-4">
                    <p>
                        If you have publications, we can automatically import them from PubMed:
                    </p>
                    <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                        <li>Search by your author name</li>
                        <li>Review and approve publications</li>
                        <li>Publications are automatically formatted</li>
                    </ul>
                    <p className="text-sm text-muted-foreground mt-2">
                        You can do this later in Settings → PubMed Import
                    </p>
                </div>
            ),
        },
        {
            title: 'Step 3: Forward Emails (Optional)',
            icon: '📧',
            content: (
                <div className="space-y-4">
                    <p>
                        Got an email about an award, presentation, or achievement?
                    </p>
                    <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                        <li>Forward it to <strong>cv@resend.cv-creator.com</strong></li>
                        <li>AI extracts the relevant information</li>
                        <li>Shows up in your Pending Entries for review</li>
                    </ul>
                    <p className="text-sm text-muted-foreground mt-2">
                        This is perfect for keeping your CV up-to-date effortlessly!
                    </p>
                </div>
            ),
        },
        {
            title: 'Step 4: Export Anytime',
            icon: '📥',
            content: (
                <div className="space-y-4">
                    <p>
                        When you need your CV, just export it:
                    </p>
                    <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                        <li><strong>Word (.docx)</strong> - Edit and customize further</li>
                        <li><strong>PDF</strong> - Perfect for applications</li>
                        <li>Professional formatting included</li>
                    </ul>
                    <p className="text-sm text-muted-foreground mt-2">
                        Click &quot;Export CV&quot; on the My CV page anytime.
                    </p>
                </div>
            ),
        },
        {
            title: "You're All Set! 🎉",
            icon: '✅',
            content: (
                <div className="space-y-4">
                    <p className="text-lg">
                        You&apos;re ready to start managing your CV!
                    </p>
                    <p className="text-muted-foreground">
                        Remember, you can always come back to Settings to upload a new CV or import publications.
                    </p>
                    <Link
                        href="/settings"
                        className="btn-primary inline-flex items-center gap-2 mt-4"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        Upload My CV Now
                    </Link>
                </div>
            ),
        },
    ];

    const handleNext = () => {
        if (currentStep < steps.length - 1) {
            setCurrentStep(currentStep + 1);
        }
    };

    const handlePrev = () => {
        if (currentStep > 0) {
            setCurrentStep(currentStep - 1);
        }
    };

    const handleSkip = () => {
        if (onDismiss) {
            onDismiss();
        }
    };

    return (
        <div className="card max-w-2xl mx-auto">
            {/* Progress dots */}
            <div className="flex justify-center gap-2 mb-6">
                {steps.map((_, index) => (
                    <button
                        key={index}
                        onClick={() => setCurrentStep(index)}
                        className={`w-2.5 h-2.5 rounded-full transition-all ${index === currentStep
                                ? 'bg-primary-500 w-8'
                                : index < currentStep
                                    ? 'bg-primary-500/50'
                                    : 'bg-muted'
                            }`}
                    />
                ))}
            </div>

            {/* Step content */}
            <div className="text-center mb-6">
                <span className="text-4xl mb-4 block">{steps[currentStep].icon}</span>
                <h2 className="text-2xl font-bold mb-4">{steps[currentStep].title}</h2>
                <div className="text-left">
                    {steps[currentStep].content}
                </div>
            </div>

            {/* Navigation */}
            <div className="flex justify-between items-center pt-4 border-t border-border">
                <button
                    onClick={handlePrev}
                    disabled={currentStep === 0}
                    className={`text-sm ${currentStep === 0 ? 'text-muted-foreground cursor-not-allowed' : 'text-primary-400 hover:text-primary-300'}`}
                >
                    ← Previous
                </button>

                <button
                    onClick={handleSkip}
                    className="text-sm text-muted-foreground hover:text-foreground"
                >
                    Skip Tutorial
                </button>

                {currentStep < steps.length - 1 ? (
                    <button
                        onClick={handleNext}
                        className="text-sm text-primary-400 hover:text-primary-300"
                    >
                        Next →
                    </button>
                ) : (
                    <button
                        onClick={handleSkip}
                        className="btn-primary text-sm"
                    >
                        Get Started
                    </button>
                )}
            </div>
        </div>
    );
}
