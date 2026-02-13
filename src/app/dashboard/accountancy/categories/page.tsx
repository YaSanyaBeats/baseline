'use client';

import React from 'react';
import {
    Box,
    Button,
    FormControl,
    InputLabel,
    MenuItem,
    Select,
    Stack,
    TextField,
    Typography,
    Alert,
    Paper,
    IconButton,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { useEffect, useState, useCallback, useRef } from 'react';
import { AccountancyCategory } from '@/lib/types';
import {
    addAccountancyCategory,
    deleteAccountancyCategory,
    getAccountancyCategories,
    reorderAccountancyCategories,
} from '@/lib/accountancyCategories';
import { buildCategoriesForSelect } from '@/lib/accountancyCategoryUtils';
import { useSnackbar } from '@/providers/SnackbarContext';
import { useUser } from '@/providers/UserProvider';
import { useTranslation } from '@/i18n/useTranslation';
import Link from 'next/link';
import {
    SortableTree,
    SimpleTreeItemWrapper,
    flattenTree,
    type TreeItem,
    type TreeItems,
    type TreeItemComponentProps,
} from 'dnd-kit-sortable-tree';
import type { AccountancyCategoryType } from '@/lib/types';

type CategoryTreeItem = TreeItem<{ name: string; category: AccountancyCategory }>;

function categoriesToTree(
    categories: AccountancyCategory[],
    type: AccountancyCategoryType
): TreeItems<{ name: string; category: AccountancyCategory }> {
    const filtered = categories.filter((c) => c.type === type);
    const byParent = new Map<string | null, AccountancyCategory[]>();
    for (const c of filtered) {
        const pid = c.parentId ?? null;
        if (!byParent.has(pid)) byParent.set(pid, []);
        byParent.get(pid)!.push(c);
    }
    for (const arr of byParent.values()) {
        arr.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }
    function build(parentId: string | null): CategoryTreeItem[] {
        const children = byParent.get(parentId) ?? [];
        return children
            .filter((c) => c._id)
            .map((c) => {
                const childItems = build(c._id!);
                return {
                    id: c._id!,
                    name: c.name,
                    category: c,
                    collapsed: false,
                    children: childItems.length > 0 ? childItems : undefined,
                };
            });
    }
    return build(null);
}

function treeToReorderPayload(
    items: TreeItems<{ name: string; category: AccountancyCategory }>
): Array<{ id: string; parentId: string | null; order: number }> {
    const flat = flattenTree(items);
    const byParent = new Map<string, Array<{ id: string }>>();
    for (const item of flat) {
        const pid = item.parentId != null ? String(item.parentId) : '';
        if (!byParent.has(pid)) byParent.set(pid, []);
        byParent.get(pid)!.push({ id: String(item.id) });
    }
    const result: Array<{ id: string; parentId: string | null; order: number }> = [];
    for (const [parentId, siblings] of byParent) {
        siblings.forEach((s, i) =>
            result.push({
                id: s.id,
                parentId: parentId || null,
                order: i,
            })
        );
    }
    return result;
}

const RefreshContext = React.createContext<((type: AccountancyCategoryType) => void) | null>(null);

const CategoryTreeItem = React.forwardRef<
    HTMLDivElement,
    TreeItemComponentProps<{ name: string; category: AccountancyCategory }>
>(function CategoryTreeItemComponent(props, ref) {
    const { t } = useTranslation();
    const { setSnackbar } = useSnackbar();
    const refresh = React.useContext(RefreshContext);
    const { item } = props;
    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!window.confirm(t('accountancy.deleteCategoryConfirm'))) return;
        deleteAccountancyCategory(String(item.id))
            .then((res) => {
                setSnackbar({
                    open: true,
                    message: res.message,
                    severity: res.success ? 'success' : 'error',
                });
                if (res.success && refresh) refresh(item.category.type);
            })
            .catch(() => {
                setSnackbar({
                    open: true,
                    message: t('common.serverError'),
                    severity: 'error',
                });
            });
    };
    return (
        <SimpleTreeItemWrapper {...props} ref={ref} hideCollapseButton disableCollapseOnItemClick>
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    py: 0.5,
                    width: '100%',
                }}
            >
                <Typography variant="body2" sx={{ flex: 1 }}>
                    {item.name}
                </Typography>
                <Link href={`/dashboard/accountancy/categories/edit/${item.id}`}>
                    <IconButton size="small" aria-label="edit">
                        <EditIcon fontSize="small" />
                    </IconButton>
                </Link>
                <IconButton size="small" aria-label="delete" onClick={handleDelete}>
                    <DeleteIcon fontSize="small" />
                </IconButton>
            </Box>
        </SimpleTreeItemWrapper>
    );
});

function CategorySection({
    type,
    titleKey,
    newCategoryLabelKey,
    categories,
    setCategories,
    newName,
    setNewName,
}: {
    type: AccountancyCategoryType;
    titleKey: string;
    newCategoryLabelKey: string;
    categories: AccountancyCategory[];
    setCategories: (c: AccountancyCategory[]) => void;
    newName: string;
    setNewName: (s: string) => void;
}) {
    const { t } = useTranslation();
    const { setSnackbar } = useSnackbar();

    const [treeItems, setTreeItems] = useState<TreeItems<{ name: string; category: AccountancyCategory }>>([]);
    const lastPayloadRef = useRef<string>('');

    useEffect(() => {
        const next = categoriesToTree(categories, type);
        setTreeItems(next);
        lastPayloadRef.current = JSON.stringify(treeToReorderPayload(next));
    }, [categories, type]);

    const handleItemsChanged = useCallback(
        (
            newItems: TreeItems<{ name: string; category: AccountancyCategory }>,
            reason?: { type?: string }
        ) => {
            if (reason?.type === 'collapsed' || reason?.type === 'expanded') return;
            const payload = treeToReorderPayload(newItems);
            if (payload.length === 0) return;
            const payloadStr = JSON.stringify(payload);
            if (payloadStr === lastPayloadRef.current) return; // Нет реального изменения — избегаем цикла
            lastPayloadRef.current = payloadStr;
            reorderAccountancyCategories(payload)
                .then((res) => {
                    setSnackbar({
                        open: true,
                        message: res.message,
                        severity: res.success ? 'success' : 'error',
                    });
                    if (res.success) {
                        setTreeItems(newItems);
                        lastPayloadRef.current = JSON.stringify(treeToReorderPayload(newItems));
                    }
                })
                .catch(() => {
                    setSnackbar({
                        open: true,
                        message: t('common.serverError'),
                        severity: 'error',
                    });
                });
        },
        [setSnackbar, t]
    );

    const [parentId, setParentId] = useState<string | null>(null);

    const handleAdd = async () => {
        const name = newName.trim();
        if (!name) return;
        try {
            const res = await addAccountancyCategory(name, type, parentId);
            setSnackbar({
                open: true,
                message: res.message,
                severity: res.success ? 'success' : 'error',
            });
            if (res.success) {
                setNewName('');
                setParentId(null);
                const updated = await getAccountancyCategories(type);
                setCategories(updated);
            }
        } catch (error) {
            console.error('Error adding category:', error);
            setSnackbar({
                open: true,
                message: t('common.serverError'),
                severity: 'error',
            });
        }
    };

    const refresh = useCallback(() => {
        getAccountancyCategories(type).then(setCategories);
    }, [type, setCategories]);

    return (
        <RefreshContext.Provider value={refresh}>
            <Paper sx={{ p: 2, flex: 1 }}>
                <Typography variant="h6" sx={{ mb: 2 }}>
                    {t(titleKey)}
                </Typography>
                <Stack spacing={2} sx={{ mb: 2 }}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                        <TextField
                            label={t(newCategoryLabelKey)}
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            fullWidth
                        />
                        <FormControl sx={{ minWidth: 180 }}>
                            <InputLabel>{t('accountancy.parentCategory')}</InputLabel>
                            <Select
                                value={parentId ?? ''}
                                label={t('accountancy.parentCategory')}
                                onChange={(e) =>
                                    setParentId(e.target.value ? (e.target.value as string) : null)
                                }
                            >
                                <MenuItem value="">{t('accountancy.noParent')}</MenuItem>
                                {buildCategoriesForSelect(categories, type).map((item) => (
                                    <MenuItem key={item.id} value={item.id}>
                                        {item.depth > 0 ? '\u00A0'.repeat(item.depth * 2) + '↳ ' : ''}
                                        {item.name}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <Button
                            variant="contained"
                            startIcon={<AddIcon />}
                            onClick={handleAdd}
                            disabled={!newName.trim()}
                        >
                            {t('accountancy.addCategory')}
                        </Button>
                    </Stack>
                </Stack>
                {treeItems.length === 0 ? (
                    <Typography color="text.secondary">{t('accountancy.noCategories')}</Typography>
                ) : (
                    <SortableTree
                        items={treeItems}
                        onItemsChanged={handleItemsChanged}
                        TreeItemComponent={CategoryTreeItem}
                        indentationWidth={24}
                    />
                )}
            </Paper>
        </RefreshContext.Provider>
    );
}

export default function Page() {
    const { t } = useTranslation();
    const { isAdmin, isAccountant } = useUser();

    const [expenseCategories, setExpenseCategories] = useState<AccountancyCategory[]>([]);
    const [incomeCategories, setIncomeCategories] = useState<AccountancyCategory[]>([]);
    const [loading, setLoading] = useState(true);
    const [newExpenseCategory, setNewExpenseCategory] = useState('');
    const [newIncomeCategory, setNewIncomeCategory] = useState('');

    const hasAccess = isAdmin || isAccountant;

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
                console.error('Error loading categories:', error);
            } finally {
                setLoading(false);
            }
        };

        load();
    }, [hasAccess]);

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
                    <CategorySection
                        type="expense"
                        titleKey="accountancy.expenseCategories"
                        newCategoryLabelKey="accountancy.newExpenseCategory"
                        categories={expenseCategories}
                        setCategories={setExpenseCategories}
                        newName={newExpenseCategory}
                        setNewName={setNewExpenseCategory}
                    />
                    <CategorySection
                        type="income"
                        titleKey="accountancy.incomeCategories"
                        newCategoryLabelKey="accountancy.newIncomeCategory"
                        categories={incomeCategories}
                        setCategories={setIncomeCategories}
                        newName={newIncomeCategory}
                        setNewName={setNewIncomeCategory}
                    />
                </Stack>
            )}
        </Box>
    );
}
