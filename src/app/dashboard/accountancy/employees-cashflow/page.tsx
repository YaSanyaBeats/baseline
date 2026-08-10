'use client';

import {
    Alert,
    Box,
    Button,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getUsersWithCashflow } from '@/lib/users';
import { useSnackbar } from '@/providers/SnackbarContext';
import { useUser } from '@/providers/UserProvider';
import { useTranslation } from '@/i18n/useTranslation';

export default function Page() {
    const { t } = useTranslation();
    const { isAdmin, isAccountant } = useUser();
    const { setSnackbar } = useSnackbar();
    const [users, setUsers] = useState<{ _id: string; name: string }[]>([]);
    const [loading, setLoading] = useState(true);

    const hasAccess = isAdmin || isAccountant;

    useEffect(() => {
        if (!hasAccess) {
            setLoading(false);
            return;
        }

        let cancelled = false;

        (async () => {
            try {
                const list = await getUsersWithCashflow();
                if (!cancelled) setUsers(list);
            } catch (err) {
                console.error(err);
                if (!cancelled) {
                    setSnackbar({
                        open: true,
                        message: t('common.serverError'),
                        severity: 'error',
                    });
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasAccess]);

    if (!hasAccess) {
        return (
            <Box>
                <Typography variant="h4">{t('accountancy.employeesCashflow.title')}</Typography>
                <Alert severity="warning" sx={{ mt: 2 }}>
                    {t('accountancy.noAccess')}
                </Alert>
            </Box>
        );
    }

    return (
        <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
                <Link href="/dashboard/accountancy">
                    <Button startIcon={<ArrowBackIcon />} size="small">
                        {t('common.back')}
                    </Button>
                </Link>
                <Typography variant="h4">{t('accountancy.employeesCashflow.title')}</Typography>
            </Box>

            {loading ? (
                <Typography>{t('accountancy.loading')}</Typography>
            ) : users.length === 0 ? (
                <Paper variant="outlined" sx={{ p: 3 }}>
                    <Typography color="text.secondary">
                        {t('accountancy.employeesCashflow.noUsers')}
                    </Typography>
                </Paper>
            ) : (
                <Paper variant="outlined" sx={{ overflow: 'auto' }}>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>{t('accountancy.employeesCashflow.userName')}</TableCell>
                                <TableCell align="right" width={160}>
                                    {t('accountancy.actions')}
                                </TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {users.map((u) => (
                                <TableRow key={u._id}>
                                    <TableCell>{u.name}</TableCell>
                                    <TableCell align="right">
                                        <Link href={`/dashboard/accountancy/employees-cashflow/${u._id}`}>
                                            <Button size="small" variant="outlined">
                                                {t('accountancy.employeesCashflow.details')}
                                            </Button>
                                        </Link>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </Paper>
            )}
        </Box>
    );
}
