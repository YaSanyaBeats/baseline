'use client'

import { MenuItem, IconButton } from "@mui/material";
import Menu from '@mui/material/Menu';
import React from "react";
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import { handleSignOut } from "@/lib/auth";
import { redirect } from "next/navigation";

export default function HeaderMenu() {
    const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
    const open = Boolean(anchorEl);
    const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
        setAnchorEl(event.currentTarget);
    };
    const handleClose = () => {
        setAnchorEl(null);
    };

    const handleMenuClick = (url: string) => {
        setAnchorEl(null);
        redirect(url);
    }

return (
    <div>
        <IconButton size="large" onClick={handleClick}>
            <AccountCircleIcon fontSize="inherit" />
        </IconButton>
        <Menu
            anchorEl={anchorEl}
            open={open}
            onClose={handleClose}
        >
            <MenuItem onClick={() => {handleMenuClick(`/dashboard/manageAccount`)}}>Управление аккаунтом</MenuItem>
            <MenuItem onClick={handleSignOut} color="error">Выйти</MenuItem>
        </Menu>
    </div>
)}
