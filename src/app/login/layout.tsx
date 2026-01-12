import React from 'react'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '../../lib/auth'

export default async function RootLayout({ children }: { children: React.ReactNode }) {
    if(!authOptions) {
        throw new Error("Username and password are empty");
    }
    const session = await getServerSession(authOptions)

    if (session) {
        redirect('/dashboard')
    }

    return children
}
