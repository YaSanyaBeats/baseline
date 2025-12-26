'use client'

import { MenuItem, IconButton, Chip, Stack } from "@mui/material";
import Menu from '@mui/material/Menu';
import React from "react";
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import { handleSignOut } from "@/lib/auth";
import { useUser } from "@/providers/UserProvider";

export default function HeaderMenu() {
    const { accountType } = useUser();
    const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
    const open = Boolean(anchorEl);
    const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
        setAnchorEl(event.currentTarget);
    };
    const handleClose = () => {
        setAnchorEl(null);
    };

    const isPremium = accountType === 'premium';
    const label = isPremium ? 'Премиум' : 'Базовый';

    return (
        <div>
            <Stack direction="row" spacing={1} alignItems="center">
                <Chip
                    label={label}
                    size="small"
                    sx={{
                        fontWeight: 700,
                        letterSpacing: 0.2,
                        color: isPremium ? '#4a2e00' : '#1f2a3d',
                        background: isPremium
                            ? 'linear-gradient(135deg, #FFB347 0%, #FFCC33 50%, #FFD86F 100%)'
                            : '#e6e8ed',
                        border: isPremium ? '1px solid #e6b800' : '1px solid #c4c8d0',
                        boxShadow: isPremium
                            ? '0 0 10px rgba(255, 204, 51, 0.5), 0 4px 12px rgba(0,0,0,0.12)'
                            : 'none'
                    }}
                />
                <IconButton size="large" onClick={handleClick}>
                    <AccountCircleIcon fontSize="inherit" sx={{color: 'white'}} />
                </IconButton>
            </Stack>
            <Menu
                anchorEl={anchorEl}
                open={open}
                onClose={handleClose}
            >
                {/* <MenuItem onClick={() => {handleMenuClick(`/dashboard/manageAccount`)}}>Управление аккаунтом</MenuItem> */}
                <MenuItem onClick={handleSignOut} color="error">Выйти</MenuItem>
            </Menu>
        </div>
    )
}
