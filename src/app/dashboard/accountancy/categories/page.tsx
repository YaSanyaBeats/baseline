'use client'

import {
    Box,
    Button,
    Stack,
    TextField,
    Typography,
    Alert,
    Paper,
    List,
    ListItem,
    ListItemText,
    IconButton,
} from "@mui/material";
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import { useEffect, useState } from "react";
import { AccountancyCategory } from "@/lib/types";
import {
    addAccountancyCategory,
    deleteAccountancyCategory,
    getAccountancyCategories,
    updateAccountancyCategory,
} from "@/lib/accountancyCategories";
import { useSnackbar } from "@/providers/SnackbarContext";
import { useUser } from "@/providers/UserProvider";
import { useTranslation } from "@/i18n/useTranslation";
import Link from 'next/link';

export default function Page() {
    const { t } = useTranslation();
    const { isAdmin, isAccountant } = useUser();
    const { setSnackbar } = useSnackbar();

    const [expenseCategories, setExpenseCategories] = useState<AccountancyCategory[]>([]);
    const [incomeCategories, setIncomeCategories] = useState<AccountancyCategory[]>([]);
    const [loading, setLoading] = useState(true);

    const [newExpenseCategory, setNewExpenseCategory] = useState('');
    const [newIncomeCategory, setNewIncomeCategory] = useState('');

    const hasAccess = isAdmin || isAccountant;

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState<string>('');

    useEffect(() => {
        if (!hasAccess) return;

        const load = async () => {
            setLoading(true);
            try {
                const [expenses, incomes] = await Promise.all([
                    getAccountancyCategories('expense'),
                    getAccountancyCategories('income'),
                ]);
                setExpenseCategories(expenses);
                setIncomeCategories(incomes);
            } catch (error) {
                console.error("Error loading categories:", error);
                setSnackbar({
                    open: true,
                    message: t('common.serverError'),
                    severity: 'error',
                });
            } finally {
                setLoading(false);
            }
        };

        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasAccess]);

    const handleAddCategory = async (type: 'expense' | 'income') => {
        const name = type === 'expense' ? newExpenseCategory.trim() : newIncomeCategory.trim();
        if (!name) return;

        try {
            const res = await addAccountancyCategory(name, type);
            setSnackbar({
                open: true,
                message: res.message,
                severity: res.success ? 'success' : 'error',
            });
            if (res.success) {
                const updated = await getAccountancyCategories(type);
                if (type === 'expense') {
                    setExpenseCategories(updated);
                    setNewExpenseCategory('');
                } else {
                    setIncomeCategories(updated);
                    setNewIncomeCategory('');
                }
            }
        } catch (error) {
            console.error("Error adding category:", error);
            setSnackbar({
                open: true,
                message: t('common.serverError'),
                severity: 'error',
            });
        }
    };

    const beginEdit = (category: AccountancyCategory) => {
        setEditingId(category._id || null);
        setEditingName(category.name);
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditingName('');
    };

    const saveEdit = async (category: AccountancyCategory, type: 'expense' | 'income') => {
        if (!editingId || !editingName.trim()) {
            cancelEdit();
            return;
        }
        try {
            const res = await updateAccountancyCategory(editingId, editingName.trim());
            setSnackbar({
                open: true,
                message: res.message,
                severity: res.success ? 'success' : 'error',
            });
            if (res.success) {
                const updated = await getAccountancyCategories(type);
                if (type === 'expense') {
                    setExpenseCategories(updated);
                } else {
                    setIncomeCategories(updated);
                }
                cancelEdit();
            }
        } catch (error) {
            console.error("Error updating category:", error);
            setSnackbar({
                open: true,
                message: t('common.serverError'),
                severity: 'error',
            });
        }
    };

    const handleDelete = async (category: AccountancyCategory, type: 'expense' | 'income') => {
        if (!category._id) return;
        // простое подтверждение через window.confirm
        if (!window.confirm(t('accountancy.deleteCategoryConfirm'))) {
            return;
        }
        try {
            const res = await deleteAccountancyCategory(category._id);
            setSnackbar({
                open: true,
                message: res.message,
                severity: res.success ? 'success' : 'error',
            });
            if (res.success) {
                const updated = await getAccountancyCategories(type);
                if (type === 'expense') {
                    setExpenseCategories(updated);
                } else {
                    setIncomeCategories(updated);
                }
            }
        } catch (error) {
            console.error("Error deleting category:", error);
            setSnackbar({
                open: true,
                message: t('common.serverError'),
                severity: 'error',
            });
        }
    };

    if (!hasAccess) {
        return (
            <Box>
                <Typography variant="h4">{t('accountancy.categoriesTitle')}</Typography>
                <Alert severity="warning" sx={{ mt: 2 }}>
                    {t('accountancy.noAccess')}
                </Alert>
            </Box>
        );
    }

    return (
        <Box>
            <Box sx={{ mb: 2 }}>
                <Link href="/dashboard/accountancy">
                    <Button variant="text" startIcon={<ArrowBackIcon />}>
                        {t('common.back')}
                    </Button>
                </Link>
            </Box>
            <Typography variant="h4" sx={{ mb: 3 }}>
                {t('accountancy.categoriesTitle')}
            </Typography>

            {loading ? (
                <Typography>{t('accountancy.loading')}</Typography>
            ) : (
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={3}>
                    <Paper sx={{ p: 2, flex: 1 }}>
                        <Typography variant="h6" sx={{ mb: 2 }}>
                            {t('accountancy.expenseCategories')}
                        </Typography>
                        <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
                            <TextField
                                label={t('accountancy.newExpenseCategory')}
                                value={newExpenseCategory}
                                onChange={(e) => setNewExpenseCategory(e.target.value)}
                                fullWidth
                            />
                            <Button
                                variant="contained"
                                startIcon={<AddIcon />}
                                onClick={() => handleAddCategory('expense')}
                                disabled={!newExpenseCategory.trim()}
                            >
                                {t('accountancy.addCategory')}
                            </Button>
                        </Stack>
                        {expenseCategories.length === 0 ? (
                            <Typography color="text.secondary">
                                {t('accountancy.noCategories')}
                            </Typography>
                        ) : (
                            <List dense>
                                {expenseCategories.map((cat) => {
                                    const isEditing = editingId === (cat._id || null);
                                    return (
                                        <ListItem
                                            key={cat._id || cat.name}
                                            secondaryAction={
                                                isEditing ? (
                                                    <Stack direction="row" spacing={1}>
                                                        <IconButton
                                                            edge="end"
                                                            aria-label="save"
                                                            onClick={() => saveEdit(cat, 'expense')}
                                                        >
                                                            <CheckIcon fontSize="small" />
                                                        </IconButton>
                                                        <IconButton
                                                            edge="end"
                                                            aria-label="cancel"
                                                            onClick={cancelEdit}
                                                        >
                                                            <CloseIcon fontSize="small" />
                                                        </IconButton>
                                                    </Stack>
                                                ) : (
                                                    <Stack direction="row" spacing={1}>
                                                        <IconButton
                                                            edge="end"
                                                            aria-label="edit"
                                                            onClick={() => beginEdit(cat)}
                                                        >
                                                            <EditIcon fontSize="small" />
                                                        </IconButton>
                                                        <IconButton
                                                            edge="end"
                                                            aria-label="delete"
                                                            onClick={() => handleDelete(cat, 'expense')}
                                                        >
                                                            <DeleteIcon fontSize="small" />
                                                        </IconButton>
                                                    </Stack>
                                                )
                                            }
                                        >
                                            {isEditing ? (
                                                <TextField
                                                    value={editingName}
                                                    onChange={(e) => setEditingName(e.target.value)}
                                                    size="small"
                                                    fullWidth
                                                />
                                            ) : (
                                                <ListItemText primary={cat.name} />
                                            )}
                                        </ListItem>
                                    );
                                })}
                            </List>
                        )}
                    </Paper>

                    <Paper sx={{ p: 2, flex: 1 }}>
                        <Typography variant="h6" sx={{ mb: 2 }}>
                            {t('accountancy.incomeCategories')}
                        </Typography>
                        <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
                            <TextField
                                label={t('accountancy.newIncomeCategory')}
                                value={newIncomeCategory}
                                onChange={(e) => setNewIncomeCategory(e.target.value)}
                                fullWidth
                            />
                            <Button
                                variant="contained"
                                startIcon={<AddIcon />}
                                onClick={() => handleAddCategory('income')}
                                disabled={!newIncomeCategory.trim()}
                            >
                                {t('accountancy.addCategory')}
                            </Button>
                        </Stack>
                        {incomeCategories.length === 0 ? (
                            <Typography color="text.secondary">
                                {t('accountancy.noCategories')}
                            </Typography>
                        ) : (
                            <List dense>
                                {incomeCategories.map((cat) => {
                                    const isEditing = editingId === (cat._id || null);
                                    return (
                                        <ListItem
                                            key={cat._id || cat.name}
                                            secondaryAction={
                                                isEditing ? (
                                                    <Stack direction="row" spacing={1}>
                                                        <IconButton
                                                            edge="end"
                                                            aria-label="save"
                                                            onClick={() => saveEdit(cat, 'income')}
                                                        >
                                                            <CheckIcon fontSize="small" />
                                                        </IconButton>
                                                        <IconButton
                                                            edge="end"
                                                            aria-label="cancel"
                                                            onClick={cancelEdit}
                                                        >
                                                            <CloseIcon fontSize="small" />
                                                        </IconButton>
                                                    </Stack>
                                                ) : (
                                                    <Stack direction="row" spacing={1}>
                                                        <IconButton
                                                            edge="end"
                                                            aria-label="edit"
                                                            onClick={() => beginEdit(cat)}
                                                        >
                                                            <EditIcon fontSize="small" />
                                                        </IconButton>
                                                        <IconButton
                                                            edge="end"
                                                            aria-label="delete"
                                                            onClick={() => handleDelete(cat, 'income')}
                                                        >
                                                            <DeleteIcon fontSize="small" />
                                                        </IconButton>
                                                    </Stack>
                                                )
                                            }
                                        >
                                            {isEditing ? (
                                                <TextField
                                                    value={editingName}
                                                    onChange={(e) => setEditingName(e.target.value)}
                                                    size="small"
                                                    fullWidth
                                                />
                                            ) : (
                                                <ListItemText primary={cat.name} />
                                            )}
                                        </ListItem>
                                    );
                                })}
                            </List>
                        )}
                    </Paper>
                </Stack>
            )}
        </Box>
    );
}

