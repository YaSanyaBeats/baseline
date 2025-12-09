import React from 'react'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '../../lib/auth'
import ObjectsProvider from '@/providers/ObjectsProvider'
import { getObjects } from '@/lib/beds24/objects'
import MiniDrawer from '@/components/leftMenu/MiniDrawer'
import { SnackbarProvider } from '@/providers/SnackbarContext'
import GlobalSnackbar from '@/components/globalSnackbar/GlobalSnackbar'


export default async function RootLayout({ children }: { children: React.ReactNode }) {
    const session = await getServerSession(authOptions);
    const objects = await getObjects(session);
    
    if (!session) {
        redirect('/login')
    }
    
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
            <ObjectsProvider serverObjects={objects} session={session}>
                <MiniDrawer>
                    {children}
                </MiniDrawer>
                <GlobalSnackbar/>
            </ObjectsProvider>
        </SnackbarProvider>
    )
}
