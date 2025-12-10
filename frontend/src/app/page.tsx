import { redirect } from 'next/navigation'

export default function Page() {
    redirect('/login');
    return 123;
}
