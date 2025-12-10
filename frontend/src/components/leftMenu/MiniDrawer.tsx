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
import { Dashboard, Analytics, PeopleAlt, MonetizationOn, Settings, House } from '@mui/icons-material';
import styles from './leftMenu.module.css'
import Image from 'next/image'
import { useSession } from 'next-auth/react';
import { User } from '@/lib/types';
import HeaderMenu from '../headerMenu/HeaderMenu';
import Drawer from '@mui/material/Drawer';
import { useMediaQuery } from '@mui/material';

const drawerWidth = 240;


const openedMixin = (theme: Theme): CSSObject => ({
width: drawerWidth,
transition: theme.transitions.create('width', {
easing: theme.transitions.easing.sharp,
duration: theme.transitions.duration.enteringScreen,
}),
overflowX: 'hidden',
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

const menu = [
    { 
        text: 'Главная', 
        icon: <Dashboard fontSize="small" />, 
        link: '/dashboard',
        isAdmin: false
    },
    { 
        text: 'Аналитика', 
        icon: <Analytics fontSize="small" />, 
        link: '/dashboard/analytics',
        isAdmin: true
    },
    { 
        text: 'Пользователи', 
        icon: <PeopleAlt fontSize="small" />, 
        link: '/dashboard/users',
        isAdmin: true
    },
    { 
        text: 'Бухгалтерия', 
        icon: <MonetizationOn fontSize="small" />, 
        link: '/dashboard/accountancy',
        isAdmin: true
    },
    { 
        text: 'Параметры', 
        icon: <Settings fontSize="small" />, 
        link: '/dashboard/options',
        isAdmin: true
    },
    { 
        text: 'Beds24', 
        icon: <House fontSize="small" />, 
        link: '/dashboard/beds24',
        isAdmin: true
    },
];

function DrawerMenu(props: {open: boolean, setOpen: (value: boolean) => void}) {
    const { data: session } = useSession();
    const { open, setOpen } = props;
    const getMenu = () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const user: User = session?.user as any; 
        if(!user) {
            return [];
        }
        
        if(user.role == 'owner') {
            return menu.filter((menuElem) => {
                return !menuElem.isAdmin;
            })
        }
        return menu;
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
                                    mr: 3,
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
    const isMobile = !useMediaQuery('(min-width:768px)');

    const handleDrawerOpen = () => {
        setOpen(true);
    };

    const handleDrawerClose = () => {
        setOpen(false);
    };

    return (
        <Box sx={{ display: 'flex', width: '100%' }}>
            <AppBar position="fixed" open={open && !isMobile}>
                <Toolbar>
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
                    <Box sx={{ flexGrow: 1 }}>
                        <Link href="/dashboard" >
                            <Image src="/logo-new.svg" alt="HolyCow logo" width={90} height={40}></Image>
                        </Link>
                    </Box>
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

                    <DrawerMenu open={open} setOpen={setOpen}/>
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
                        '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
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

                    <DrawerMenu open={open} setOpen={setOpen}/>
                </Drawer>
            )}

            <Box component="main" sx={{ flexGrow: 1, p: 3, overflowX: 'auto' }}>
                <DrawerHeader />
                {children}
            </Box>
        </Box>
    );
}