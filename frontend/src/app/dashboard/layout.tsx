import React from 'react'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '../../lib/auth'
import { Box, Stack, Paper } from '@mui/material'
import Image from 'next/image'
import Link from 'next/link'
import LeftMenu from '@/components/leftMenu/LeftMenu'
import HeaderMenu from '@/components/headerMenu/HeaderMenu'

export default async function RootLayout({ children }: { children: React.ReactNode }) {
    const session = await getServerSession(authOptions)

    if (!session) {
        redirect('/login')
    }

    return (
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
            {/*<h1>Мы в дашборде ура {session?.user?.name}</h1>
            {session?.user?.image && (
                <Image src={session?.user?.image} alt="user image" width={96} height={96} />
            )}
            <Button variant="contained" endIcon={<LogoutIcon />} onClick={handleSignOut}>
                Выйти
            </Button>*/}
        </Box>
    )
}
