'use client';

import { useState, useEffect } from 'react';

interface Template {
    id: string;
    name: string;
    description: string;
    maxPages?: number;
}

export function ExportModal() {
    const [isOpen, setIsOpen] = useState(false);
    const [templates, setTemplates] = useState<Template[]>([]);
    const [selectedTemplate, setSelectedTemplate] = useState('traditional');
    const [isExporting, setIsExporting] = useState(false);

    useEffect(() => {
        if (isOpen) {
            fetch('/api/cv/export/templates')
                .then(res => res.json())
                .then(data => setTemplates(data.templates || []))
                .catch(console.error);
        }
    }, [isOpen]);

    const handleExport = async (format: 'pdf' | 'docx') => {
        setIsExporting(true);
        try {
            const response = await fetch(`/api/cv/export/${format}?template=${selectedTemplate}`);

            if (!response.ok) {
                throw new Error('Export failed');
            }

            // Get the blob and trigger download
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `CV_${selectedTemplate}_${new Date().toISOString().split('T')[0]}.${format}`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            setIsOpen(false);
        } catch (error) {
            console.error('Export error:', error);
            alert('Failed to export CV. Please try again.');
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <>
            {/* Export Button */}
            <button
                onClick={() => setIsOpen(true)}
                className="btn-secondary flex items-center gap-2"
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Export CV
            </button>

            {/* Modal */}
            {isOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-card rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold">Export CV</h2>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="text-muted-foreground hover:text-foreground"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Template Selection */}
                        <div className="mb-6">
                            <label className="block text-sm font-medium mb-2">Select Template</label>
                            <div className="space-y-2">
                                {templates.map(template => (
                                    <label
                                        key={template.id}
                                        className={`flex items-start p-3 rounded-lg border cursor-pointer transition-colors ${selectedTemplate === template.id
                                                ? 'border-primary-500 bg-primary-500/10'
                                                : 'border-border hover:border-primary-500/50'
                                            }`}
                                    >
                                        <input
                                            type="radio"
                                            name="template"
                                            value={template.id}
                                            checked={selectedTemplate === template.id}
                                            onChange={() => setSelectedTemplate(template.id)}
                                            className="mt-1 mr-3"
                                        />
                                        <div>
                                            <div className="font-medium">{template.name}</div>
                                            <div className="text-sm text-muted-foreground">
                                                {template.description}
                                                {template.maxPages && (
                                                    <span className="ml-2 text-xs bg-muted px-2 py-0.5 rounded">
                                                        {template.maxPages} page limit
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* Export Buttons */}
                        <div className="flex gap-3">
                            <button
                                onClick={() => handleExport('pdf')}
                                disabled={isExporting}
                                className="flex-1 btn-primary flex items-center justify-center gap-2"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                </svg>
                                {isExporting ? 'Exporting...' : 'Download PDF'}
                            </button>
                            <button
                                onClick={() => handleExport('docx')}
                                disabled={isExporting}
                                className="flex-1 btn-secondary flex items-center justify-center gap-2"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                {isExporting ? 'Exporting...' : 'Download Word'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
