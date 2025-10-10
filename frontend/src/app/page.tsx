import { redirect } from 'next/navigation'

export default function Page() {
    redirect('/login');
    return <h1>Hello, Next.js!</h1>
}
