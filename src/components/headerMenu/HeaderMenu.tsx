'use client'

import { MenuItem, IconButton, Chip, Stack, Select } from "@mui/material";
import Menu from '@mui/material/Menu';
import React from "react";
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import { handleSignOut } from "@/lib/auth";
import { useUser } from "@/providers/UserProvider";
import { useLanguage } from "@/i18n/LanguageContext";
import { useTranslation } from "@/i18n/useTranslation";

export default function HeaderMenu() {
    const { accountType } = useUser();
    const { language, setLanguage } = useLanguage();
    const { t } = useTranslation();
    const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
    const open = Boolean(anchorEl);
    const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
        setAnchorEl(event.currentTarget);
    };
    const handleClose = () => {
        setAnchorEl(null);
    };
    const isPremium = accountType === 'premium';
    const label = isPremium ? t('header.premium') : t('header.basic');

    const pill = {
        height: 32,
        borderRadius: '999px',
        bgcolor: 'rgba(255,255,255,0.12)',
        border: '1px solid rgba(255,255,255,0.22)',
        color: '#F5F3EF',
        '&:hover': {
            bgcolor: 'rgba(255,255,255,0.18)',
        },
    };

    return (
        <div>
            <Stack direction="row" spacing={0.75} alignItems="center">
                <Chip
                    label={label}
                    size="small"
                    sx={{
                        ...pill,
                        fontWeight: 700,
                        fontSize: 13,
                        letterSpacing: '0.02em',
                        ...(isPremium
                            ? {
                                color: '#3A2508',
                                bgcolor: '#F0B429',
                                background: 'linear-gradient(180deg, #FFE08A 0%, #F0B429 100%)',
                                border: '1px solid #FFE7A8',
                                boxShadow: '0 0 14px rgba(240, 180, 41, 0.55)',
                            }
                            : {}),
                        '& .MuiChip-label': { px: 1.5 },
                    }}
                />
                <Select
                    value={language}
                    variant="standard"
                    disableUnderline
                    onChange={(e) => setLanguage(e.target.value as 'ru' | 'en')}
                    sx={{
                        ...pill,
                        minWidth: 68,
                        fontSize: 13,
                        fontWeight: 600,
                        letterSpacing: '0.04em',
                        '& .MuiSelect-select': {
                            py: 0,
                            pl: 1.5,
                            pr: '26px !important',
                            height: 32,
                            minHeight: '0 !important',
                            display: 'flex',
                            alignItems: 'center',
                            boxSizing: 'border-box',
                        },
                        '& .MuiSvgIcon-root': {
                            color: 'rgba(245, 243, 239, 0.9)',
                            right: 2,
                        },
                    }}
                >
                    <MenuItem value="ru">RU</MenuItem>
                    <MenuItem value="en">EN</MenuItem>
                </Select>
                <IconButton onClick={handleClick} sx={{ ...pill, width: 32, p: 0 }}>
                    <AccountCircleIcon sx={{ fontSize: 20, color: '#F5F3EF' }} />
                </IconButton>
            </Stack>
            <Menu
                anchorEl={anchorEl}
                open={open}
                onClose={handleClose}
            >
                {/* <MenuItem onClick={() => {handleMenuClick(`/dashboard/manageAccount`)}}>{t('menu.manageAccount')}</MenuItem> */}
                <MenuItem onClick={handleSignOut} color="error">{t('menu.signOut')}</MenuItem>
            </Menu>
        </div>
    )
}
