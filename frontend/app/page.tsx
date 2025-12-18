// frontend/src/app/page.tsx

import { redirect } from 'next/navigation';

// This component runs when a user navigates to the root path (http://localhost:3000/)
export default function RootPage() {
  redirect('/login');
}