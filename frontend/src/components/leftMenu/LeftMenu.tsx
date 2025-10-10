import { Analytics, MonetizationOn, PeopleAlt,  Dashboard, House } from "@mui/icons-material";
import { MenuList, MenuItem, ListItemIcon, ListItemText, Divider, Stack } from "@mui/material";

import Link from 'next/link'
import styles from './leftMenu.module.css'

export default function LeftMenu() {
return (
    <MenuList>
        <Link href="/dashboard" className={styles.link}>
            <MenuItem>
                <Stack direction="row" alignItems={'center'}>
                    <ListItemIcon>
                        <Dashboard fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>Главная</ListItemText>
                </Stack>
            </MenuItem>
        </Link>
        <Link href="/dashboard/analytics" className={styles.link}>
            <MenuItem>
                <Stack direction="row" alignItems={'center'}>
                    <ListItemIcon>
                        <Analytics fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>Аналитика</ListItemText>
                </Stack>
            </MenuItem>
        </Link>
        <Link href="/dashboard/users" className={styles.link}>
            <MenuItem>
                <Stack direction="row" alignItems={'center'}>
                    <ListItemIcon>
                        <PeopleAlt fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>Пользователи</ListItemText>
                </Stack>
            </MenuItem>
        </Link>
        <Link href="/dashboard/accountancy" className={styles.link}>
            <MenuItem>
                <Stack direction="row" alignItems={'center'}>
                    <ListItemIcon>
                        <MonetizationOn fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>Бухгалтерия</ListItemText>
                </Stack>
            </MenuItem>
        </Link>
        <Divider />
        <Link href="/dashboard/beds24" className={styles.link}>
            <MenuItem>
                <Stack direction="row" alignItems={'center'}>
                    <ListItemIcon>
                        <House fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>Синхронизация с Beds24</ListItemText>
                </Stack>
            </MenuItem>
        </Link>
    </MenuList>
)}
