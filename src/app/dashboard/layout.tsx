import React from 'react'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '../../lib/auth'
import ObjectsProvider from '@/providers/ObjectsProvider'
import { getObjects } from '@/lib/beds24/objects'
import MiniDrawer from '@/components/leftMenu/MiniDrawer'
import { SnackbarProvider } from '@/providers/SnackbarContext'
import GlobalSnackbar from '@/components/globalSnackbar/GlobalSnackbar'
import UserProvider from '@/providers/UserProvider'
import { User } from '@/lib/types'


export default async function RootLayout({ children }: { children: React.ReactNode }) {
    const session = await getServerSession(authOptions);
    
    if (!session) {
        redirect('/login')
    }
    
    const objects = await getObjects(session);
    const user = session?.user as User | null;
    
    let defaultSnackbarState = {
        open: false,
        message: '',
        severity: 'success' as 'success' | 'error' | 'warning' | 'info',
    }
    if(!objects.length) {
        defaultSnackbarState = {
            open: true,
            message: 'Ошибка получения объектов',
            severity: 'error' as 'success' | 'error' | 'warning' | 'info',
        }
    }

    return (
        <SnackbarProvider defaultState={defaultSnackbarState}>
            <UserProvider user={user}>
                <ObjectsProvider serverObjects={objects} session={session}>
                    <MiniDrawer>
                        {children}
                    </MiniDrawer>
                    <GlobalSnackbar/>
                </ObjectsProvider>
            </UserProvider>
        </SnackbarProvider>
    )
}
