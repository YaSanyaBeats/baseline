'use client';

import * as React from 'react';
import { styled, Theme, CSSObject } from '@mui/material/styles';
import Box from '@mui/material/Box';
import MuiDrawer from '@mui/material/Drawer';
import MuiAppBar, { AppBarProps as MuiAppBarProps } from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import List from '@mui/material/List';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import MenuIcon from '@mui/icons-material/Menu';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Link from 'next/link'
import { Dashboard, Analytics, PeopleAlt, MonetizationOn, Settings, House, History, Business, AccountBalanceWallet, Description, Reply, Payments, PriceChange, QueryStats } from '@mui/icons-material';
import styles from './leftMenu.module.css'
import Image from 'next/image'
import { User } from '@/lib/types';
import { useUser } from '@/providers/UserProvider';
import HeaderMenu from '../headerMenu/HeaderMenu';
import Typography from '@mui/material/Typography';
import Drawer from '@mui/material/Drawer';
import { useMediaQuery } from '@mui/material';
import { useTranslation } from '@/i18n/useTranslation';
import { useSession } from 'next-auth/react';
import Button from '@mui/material/Button';
import { stopImpersonation } from '@/lib/auth';
import { canAccessReports, isAdminImpersonatingOwner } from '@/lib/impersonationAccess';
import type { Session } from 'next-auth';

const drawerWidth = 240;

type UserRole = User['role'];
type MenuItem = {
    text: string;
    icon: React.ReactNode;
    link: string;
    roles: UserRole[];
    showOnlyWhenHasCashflow?: boolean;
    /** Только для владельца или админа, вошедшего под владельцем. */
    showOnlyWhenCanAccessReports?: boolean;
    /** Пункт у владельца Premium и у админа, вошедшего под владельцем. */
    showForPremium?: boolean;
};


const openedMixin = (theme: Theme): CSSObject => ({
width: drawerWidth,
transition: theme.transitions.create('width', {
easing: theme.transitions.easing.sharp,
duration: theme.transitions.duration.enteringScreen,
}),
overflowX: 'hidden',
backgroundColor: '#F5F3EF',
borderRight: '1px solid #E4E0DA',
});

const closedMixin = (theme: Theme): CSSObject => ({
    transition: theme.transitions.create('width', {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.leavingScreen,
}),
overflowX: 'hidden',
width: `calc(${theme.spacing(7)} + 1px)`,
[theme.breakpoints.up('sm')]: {
    width: `calc(${theme.spacing(8)} + 1px)`,
},
backgroundColor: '#F5F3EF',
borderRight: '1px solid #E4E0DA',
});

const DrawerHeader = styled('div')(({ theme }) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    padding: theme.spacing(0, 1),
    ...theme.mixins.toolbar,
}));

interface AppBarProps extends MuiAppBarProps {
    open?: boolean;
}

const AppBar = styled(MuiAppBar, {
    shouldForwardProp: (prop) => prop !== 'open',
    })<AppBarProps>(({ theme }) => ({
        zIndex: theme.zIndex.drawer + 1,
        transition: theme.transitions.create(['width', 'margin'], {
        easing: theme.transitions.easing.sharp,
        duration: theme.transitions.duration.leavingScreen,
    }),
    variants: [
        {
            props: ({ open }) => open,
            style: {
            marginLeft: drawerWidth,
            width: `calc(100% - ${drawerWidth}px)`,
            transition: theme.transitions.create(['width', 'margin'], {
                easing: theme.transitions.easing.sharp,
                duration: theme.transitions.duration.enteringScreen,
            }),
            },
        },
    ],
}));

const DesktopDrawer = styled(MuiDrawer, { shouldForwardProp: (prop) => prop !== 'open' })(
    ({ theme }) => ({
    width: drawerWidth,
    flexShrink: 0,
    whiteSpace: 'nowrap',
    boxSizing: 'border-box',
    variants: [
        {
        props: ({ open }) => open,
        style: {
            ...openedMixin(theme),
            '& .MuiDrawer-paper': openedMixin(theme),
        },
        },
        {
        props: ({ open }) => !open,
        style: {
            ...closedMixin(theme),
            '& .MuiDrawer-paper': closedMixin(theme),
        },
        },
    ],
}),
);

function DrawerMenu(props: {
    open: boolean;
    setOpen: (value: boolean) => void;
    user: User | null;
    session: Session | null;
    isOwner: boolean;
    isPremiumAccount: boolean;
}) {
    const { open, setOpen, user, session, isOwner, isPremiumAccount } = props;
    const { t } = useTranslation();
    
    const menu: MenuItem[] = [
        { 
            text: t('menu.home'), 
            icon: <Dashboard fontSize="small" />, 
            link: '/dashboard',
            roles: ['admin', 'accountant', 'owner']
        },
        {
            text: t('menu.statistics'),
            icon: <QueryStats fontSize="small" />,
            link: '/dashboard/statistics',
            roles: [],
            showForPremium: true,
        },
        {
            text: t('menu.reports'),
            icon: <Description fontSize="small" />,
            link: '/dashboard/reports',
            roles: [],
            showOnlyWhenCanAccessReports: true,
        },
        { 
            text: t('menu.analytics'), 
            icon: <Analytics fontSize="small" />, 
            link: '/dashboard/analytics',
            roles: ['admin'],
        },
        {
            text: t('menu.pricing'),
            icon: <PriceChange fontSize="small" />,
            link: '/dashboard/pricing',
            roles: ['admin']
        },
        { 
            text: t('menu.users'), 
            icon: <PeopleAlt fontSize="small" />, 
            link: '/dashboard/users',
            roles: ['admin']
        },
        { 
            text: t('menu.accountancy'), 
            icon: <MonetizationOn fontSize="small" />, 
            link: '/dashboard/accountancy',
            roles: ['admin', 'accountant']
        },
        { 
            text: t('menu.employeesCashflow'), 
            icon: <Payments fontSize="small" />, 
            link: '/dashboard/accountancy/employees-cashflow',
            roles: ['admin', 'accountant']
        },
        { 
            text: t('menu.cashflow'), 
            icon: <AccountBalanceWallet fontSize="small" />, 
            link: '/dashboard/cashflow',
            roles: [],
            showOnlyWhenHasCashflow: true
        },
        { 
            text: t('menu.auditLogs'), 
            icon: <History fontSize="small" />, 
            link: '/dashboard/auditLogs',
            roles: ['admin', 'accountant']
        },
        { 
            text: t('menu.internalObjects'), 
            icon: <Business fontSize="small" />, 
            link: '/dashboard/internalObjects',
            roles: ['admin']
        },
        { 
            text: t('menu.options'), 
            icon: <Settings fontSize="small" />, 
            link: '/dashboard/options',
            roles: ['admin']
        },
        { 
            text: t('menu.beds24'), 
            icon: <House fontSize="small" />, 
            link: '/dashboard/beds24',
            roles: ['admin']
        },
    ];
    const getMenu = () => {
        if (!user) {
            return [];
        }

        return menu.filter((menuElem) => {
            if (menuElem.showOnlyWhenCanAccessReports) {
                return canAccessReports(session, { isOwner });
            }
            if (menuElem.showOnlyWhenHasCashflow) return Boolean(user.hasCashflow);
            if (
                menuElem.showForPremium &&
                ((isOwner && isPremiumAccount) || isAdminImpersonatingOwner(session))
            ) {
                return true;
            }
            if (menuElem.roles.length === 0) return false;
            return menuElem.roles.includes(user.role);
        })
    }

    return (
        <List>
            {getMenu().map((item, index) => (
                <ListItem key={index} disablePadding sx={{ display: 'block' }} onClick={setOpen.bind(null, false)}>
                    <Link href={item.link} className={styles.link}>
                        <ListItemButton
                        sx={[
                            {
                            minHeight: 48,
                            px: 2.5,
                            },
                            open
                            ? {
                                justifyContent: 'initial',
                                alignItems: 'flex-start',
                                py: 1.25,
                                }
                            : {
                                justifyContent: 'center',
                                },
                        ]}
                        >
                        <ListItemIcon
                            sx={[
                            {
                                minWidth: 0,
                                justifyContent: 'center',
                            },
                            open
                                ? {
                                    mr: 2,
                                    mt: '2px',
                                }
                                : {
                                    mr: 'auto',
                                },
                            ]}
                        >
                            {item.icon}
                        </ListItemIcon>
                        <ListItemText
                            primary={item.text}
                            sx={[
                            open
                                ? {
                                    opacity: 1,
                                    my: 0,
                                    whiteSpace: 'normal',
                                    '& .MuiListItemText-primary': {
                                        whiteSpace: 'normal',
                                        lineHeight: 1.3,
                                    },
                                }
                                : {
                                    opacity: 0,
                                },
                            ]}
                        />
                        </ListItemButton>
                    </Link>
                </ListItem>
            ))}
        </List>
    )
}

export default function MiniDrawer({ children }: { children: React.ReactNode }) {
    const [open, setOpen] = React.useState(false);
    const [stoppingImpersonation, setStoppingImpersonation] = React.useState(false);
    const isMobile = !useMediaQuery('(min-width:768px)');
    const { user, isOwner } = useUser();
    const isPremiumAccount = user?.accountType === 'premium';
    const { data: session } = useSession();
    const { t } = useTranslation();
    const impersonatedBy = session?.impersonatedBy;
    const drawerSession = session ?? null;

    const handleDrawerOpen = () => {
        setOpen(true);
    };

    const handleDrawerClose = () => {
        setOpen(false);
    };

    const handleStopImpersonation = async () => {
        if (stoppingImpersonation) return;
        setStoppingImpersonation(true);
        try {
            await stopImpersonation();
        } catch (err) {
            console.error('Stop impersonation error:', err);
        } finally {
            setStoppingImpersonation(false);
        }
    };

    return (
        <Box sx={{ display: 'flex', width: '100%' }}>
            <AppBar
                position="fixed"
                color="transparent"
                elevation={0}
                open={open && !isMobile}
                sx={{
                    color: '#F5F3EF',
                    backgroundColor: '#2F7A6B',
                    backgroundImage: 'linear-gradient(105deg, #24685B 0%, #2F7A6B 48%, #3C917E 100%)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.22)',
                    '&::after': {
                        content: '""',
                        position: 'absolute',
                        inset: 0,
                        pointerEvents: 'none',
                        opacity: 0.16,
                        mixBlendMode: 'overlay',
                        backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
                    },
                }}
            >
                <Toolbar sx={{ position: 'relative', zIndex: 1 }}>
                    <IconButton
                        color="inherit"
                        onClick={handleDrawerOpen}
                        edge="start"
                        sx={[
                            {
                            marginRight: {xs: 1, sm: 4},
                            },
                            (open && !isMobile) && { display: 'none' },
                        ]}
                    >
                        <MenuIcon />
                    </IconButton>
                    <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', gap: 2, minWidth: 0 }}>
                        <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', lineHeight: 0 }}>
                            <Image src="/baseline-logo-header.svg" alt="Baseline" width={153} height={40} />
                        </Link>
                        <Box
                            sx={{
                                display: { xs: 'none', sm: 'flex' },
                                alignItems: 'baseline',
                                gap: 0.75,
                                minWidth: 0,
                                pl: 2,
                                borderLeft: '1px solid rgba(245, 243, 239, 0.28)',
                            }}
                        >
                            <Typography
                                component="span"
                                sx={{
                                    fontSize: 13,
                                    fontWeight: 500,
                                    color: 'rgba(245, 243, 239, 0.68)',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {t('header.greeting')}
                            </Typography>
                            {user?.name ? (
                                <Typography
                                    component="span"
                                    sx={{
                                        fontSize: 15,
                                        fontWeight: 650,
                                        letterSpacing: '-0.01em',
                                        color: '#F5F3EF',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                    }}
                                >
                                    {user.name}
                                </Typography>
                            ) : null}
                        </Box>
                    </Box>
                    {impersonatedBy && (
                        <Button
                            variant="outlined"
                            size="small"
                            startIcon={<Reply />}
                            onClick={handleStopImpersonation}
                            disabled={stoppingImpersonation}
                            sx={{
                                height: 32,
                                mr: 1,
                                px: 1.25,
                                color: '#F5F3EF',
                                borderColor: 'rgba(255,255,255,0.22)',
                                borderRadius: '999px',
                                bgcolor: 'rgba(255,255,255,0.12)',
                                whiteSpace: 'nowrap',
                                '&:hover': {
                                    borderColor: 'rgba(255,255,255,0.4)',
                                    bgcolor: 'rgba(255,255,255,0.18)',
                                },
                            }}
                        >
                            {t('header.exitImpersonation')}
                        </Button>
                    )}
                    <HeaderMenu></HeaderMenu>
                </Toolbar>
            </AppBar>

            {!isMobile ? (
                <DesktopDrawer
                    variant={"permanent"}
                    open={open}
                >
                    <DrawerHeader>
                        <IconButton onClick={handleDrawerClose}>
                            <ChevronLeftIcon />
                        </IconButton>
                    </DrawerHeader>
                    <Divider />

                    <DrawerMenu open={open} setOpen={setOpen} user={user} session={drawerSession} isOwner={isOwner} isPremiumAccount={isPremiumAccount} />
                </DesktopDrawer>
            ) : (
                <Drawer
                    ModalProps={{
                        keepMounted: false,
                    }}
                    open={open}
                    onClose={handleDrawerClose}
                    sx={{
                        zIndex: 9999,
                        display: { xs: 'block', sm: 'none' },
                        '& .MuiDrawer-paper': {
                            boxSizing: 'border-box',
                            width: drawerWidth,
                            backgroundColor: '#F5F3EF',
                        },
                    }}
                    slotProps={{
                        root: {
                        keepMounted: true, // Better open performance on mobile.
                        },
                    }}
                >
                    <DrawerHeader>
                        <IconButton onClick={handleDrawerClose}>
                            <ChevronLeftIcon />
                        </IconButton>
                    </DrawerHeader>
                    <Divider />

                    <DrawerMenu open={open} setOpen={setOpen} user={user} session={drawerSession} isOwner={isOwner} isPremiumAccount={isPremiumAccount} />
                </Drawer>
            )}

            <Box component="main" sx={{ flexGrow: 1, p: 3, overflowX: 'auto' }}>
                <DrawerHeader />
                {children}
            </Box>
        </Box>
    );
}