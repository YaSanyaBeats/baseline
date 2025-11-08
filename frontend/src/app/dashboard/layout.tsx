import React from 'react'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '../../lib/auth'
import ObjectsProvider from '@/providers/ObjectsProvider'
import { getObjects } from '@/lib/beds24/objects'
import MiniDrawer from '@/components/leftMenu/MiniDrawer'


export default async function RootLayout({ children }: { children: React.ReactNode }) {
    const session = await getServerSession(authOptions);
    const objects = await getObjects();

    if (!session) {
        redirect('/login')
    }

    return (
        <ObjectsProvider serverObjects={objects}>
            <MiniDrawer>
                {children}
            </MiniDrawer>
        </ObjectsProvider>
    )
}
