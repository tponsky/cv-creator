import { redirect } from 'next/navigation';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

// Dashboard redirects to /cv - the main CV page now serves as the home
export default function DashboardPage() {
    redirect('/cv');
}
