import { redirect } from 'next/navigation';

export default async function Home() {
    // No authentication - redirect directly to dashboard
    redirect('/dashboard');
}
