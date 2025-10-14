import React from 'react'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '../../lib/auth'
import { Box, Stack, Paper } from '@mui/material'
import Image from 'next/image'
import Link from 'next/link'
import LeftMenu from '@/components/leftMenu/LeftMenu'
import HeaderMenu from '@/components/headerMenu/HeaderMenu'
import ObjectsProvider from '@/providers/ObjectsProvider'
import { getObjects } from '@/lib/beds24/objects'


export default async function RootLayout({ children }: { children: React.ReactNode }) {
    const session = await getServerSession(authOptions);
    const objects = await getObjects();

    if (!session) {
        redirect('/login')
    }

    return (
        <ObjectsProvider serverObjects={objects}>
            <Box padding={3} height={'100vh'}>
                <Stack spacing={2} height={'100%'}>
                    <Paper elevation={2}>
                        <Stack padding={2} direction="row" justifyContent={'space-between'}>
                            <Link href="/dashboard">
                                <Stack direction="row">
                                    <Image src="/logo.svg" alt="HolyCow logo" width={90} height={40}></Image>
                                </Stack>
                            </Link>
                            <HeaderMenu></HeaderMenu>
                        </Stack>
                    </Paper>
                    <Stack spacing={2} direction="row" sx={{ flexGrow: '1' }}>
                        <Paper elevation={2} sx={{ width: '300px' }}>
                            <LeftMenu></LeftMenu>
                        </Paper>
                        <Paper elevation={2} sx={{ flexGrow: '1', padding: 2 }}>
                            {children}
                        </Paper>
                    </Stack>
                </Stack>
            </Box>
        </ObjectsProvider>
    )
}
