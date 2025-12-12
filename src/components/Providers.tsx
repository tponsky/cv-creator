'use client';

import { ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
    // Simple wrapper - JWT auth doesn't need a provider
    return <>{children}</>;
}
