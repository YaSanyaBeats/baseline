'use client'
import { CssBaseline, createTheme, ThemeProvider } from '@mui/material'
import { SessionProvider } from 'next-auth/react'
import { LanguageProvider } from '@/i18n/LanguageContext'
import React from 'react'

export default function RootLayout({ children }: { children: React.ReactNode }) {

    const theme = React.useMemo(() => {
        return createTheme({
            cssVariables: {
                colorSchemeSelector: ':root, [data-mui-color-scheme]',
                cssVarPrefix: 'template',
            },
            typography: {
                fontFamily: 'Inter, Arial',
            },
            components: {
                MuiCssBaseline: {
                styleOverrides: `
                    @font-face {
                        font-family: 'Inter';
                        font-style: normal;
                        font-display: swap;
                        font-weight: 400;
                        src: local('Inter'), local('Inter-Regular'), url(/fonts/Inter-Regular.ttf) format('woff2');
                    }
                        @font-face {
                        font-family: 'Inter';
                        font-style: normal;
                        font-display: swap;
                        font-weight: 700;
                        src: local('Inter'), local('Inter-Bold'), url(/fonts/Inter-Bold.ttf) format('woff2');
                    }
                `,
                },
            },
        })
    }, [])

    return (
        <html lang="en">
            <SessionProvider>
                <LanguageProvider>
                    <ThemeProvider theme={theme} disableTransitionOnChange>
                        <CssBaseline enableColorScheme />
                        <body>{children}</body>
                    </ThemeProvider>
                </LanguageProvider>
            </SessionProvider>
        </html>
    )
}
