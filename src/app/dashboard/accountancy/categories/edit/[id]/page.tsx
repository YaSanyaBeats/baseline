'use client';

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
    CircularProgress,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SendIcon from '@mui/icons-material/Send';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
    AccountancyCategory,
    CategoryDivisibility,
    CategoryCheckInOut,
} from '@/lib/types';
import {
    getAccountancyCategories,
    getAccountancyCategoryById,
    updateAccountancyCategory,
} from '@/lib/accountancyCategories';
import { buildCategoriesForSelect } from '@/lib/accountancyCategoryUtils';
import { useSnackbar } from '@/providers/SnackbarContext';
import { useUser } from '@/providers/UserProvider';
import { useTranslation } from '@/i18n/useTranslation';
import { useRouter, useParams } from 'next/navigation';

const DIVISIBILITY_OPTIONS: CategoryDivisibility[] = ['/2', '/3', 'неделимый'];
const CHECK_IN_OUT_OPTIONS: { value: CategoryCheckInOut; labelKey: string }[] = [
    { value: 'checkin', labelKey: 'checkin' },
    { value: 'checkout', labelKey: 'checkout' },
];

export default function Page() {
    const { t } = useTranslation();
    const router = useRouter();
    const params = useParams();
    const categoryId = params?.id as string;
    const { isAdmin, isAccountant } = useUser();
    const { setSnackbar } = useSnackbar();

    const [category, setCategory] = useState<Partial<AccountancyCategory>>({});
    const [allCategories, setAllCategories] = useState<AccountancyCategory[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});

    const hasAccess = isAdmin || isAccountant;

    useEffect(() => {
        if (!hasAccess || !categoryId) return;

        const load = async () => {
            setLoading(true);
            try {
                const [found, categories] = await Promise.all([
                    getAccountancyCategoryById(categoryId),
                    getAccountancyCategories(),
                ]);
                setAllCategories(categories);
                if (found) {
                    setCategory(found);
                } else {
                    setSnackbar({
                        open: true,
                        message: t('accountancy.categoryNotFound'),
                        severity: 'error',
                    });
                    router.push('/dashboard/accountancy/categories');
                }
            } catch (error) {
                console.error('Error loading category:', error);
                setSnackbar({
                    open: true,
                    message: t('common.serverError'),
                    severity: 'error',
                });
                router.push('/dashboard/accountancy/categories');
            } finally {
                setLoading(false);
            }
        };

        load();
    }, [hasAccess, categoryId, router]);

    const getDescendantIds = (parentId: string): string[] => {
        const children = allCategories.filter((c) => c.parentId === parentId);
        return children.flatMap((c) =>
            c._id ? [c._id, ...getDescendantIds(c._id)] : []
        );
    };
    const descendantIds = categoryId ? getDescendantIds(categoryId) : [];
    const excludeIds = categoryId ? [categoryId, ...descendantIds] : [];
    const parentOptionsForSelect = category.type
        ? buildCategoriesForSelect(allCategories, category.type, { excludeIds })
        : [];

    const handleSubmit = async () => {
        const validationErrors: Record<string, string> = {};
        if (!category.name?.trim()) {
            validationErrors.name = t('accountancy.category');
        }
        setErrors(validationErrors);
        if (Object.keys(validationErrors).length > 0) return;

        if (!category._id) return;

        setSaving(true);
        try {
            const res = await updateAccountancyCategory(category._id, {
                name: category.name!.trim(),
                parentId: category.parentId || null,
                order: category.order,
                unit: category.unit,
                divisibility: category.divisibility,
                pricePerUnit: category.pricePerUnit,
                attributionDate: category.attributionDate || undefined,
                isAuto: category.isAuto,
                checkInOut: category.checkInOut,
                reportingPeriod: category.reportingPeriod || undefined,
            });
            setSnackbar({
                open: true,
                message: res.message,
                severity: res.success ? 'success' : 'error',
            });
            if (res.success) {
                router.push('/dashboard/accountancy/categories');
            }
        } catch (error) {
            console.error('Error saving category:', error);
            setSnackbar({
                open: true,
                message: t('common.serverError'),
                severity: 'error',
            });
        } finally {
            setSaving(false);
        }
    };

    if (!hasAccess) {
        return (
            <Box>
                <Typography variant="h4">{t('accountancy.editCategory')}</Typography>
                <Alert severity="warning" sx={{ mt: 2 }}>
                    {t('accountancy.noAccess')}
                </Alert>
            </Box>
        );
    }

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Box>
            <Box sx={{ mb: 2 }}>
                <Link href="/dashboard/accountancy/categories">
                    <Button variant="text" startIcon={<ArrowBackIcon />}>
                        {t('common.back')}
                    </Button>
                </Link>
            </Box>
            <Typography variant="h4" sx={{ mb: 3 }}>
                {t('accountancy.editCategory')}: {category.name}
            </Typography>

            <Stack spacing={3} sx={{ maxWidth: 480 }}>
                <TextField
                    label={t('accountancy.categoryName')}
                    value={category.name ?? ''}
                    onChange={(e) => setCategory((p) => ({ ...p, name: e.target.value }))}
                    error={!!errors.name}
                    helperText={errors.name}
                    fullWidth
                    required
                />

                <FormControl fullWidth>
                    <InputLabel>{t('accountancy.parentCategory')}</InputLabel>
                    <Select
                        value={category.parentId ?? ''}
                        label={t('accountancy.parentCategory')}
                        onChange={(e) =>
                            setCategory((p) => ({
                                ...p,
                                parentId: e.target.value ? (e.target.value as string) : null,
                            }))
                        }
                    >
                        <MenuItem value="">{t('accountancy.noParent')}</MenuItem>
                        {parentOptionsForSelect.map((item) => (
                            <MenuItem key={item.id} value={item.id}>
                                {item.depth > 0 ? '\u00A0'.repeat(item.depth * 2) + '↳ ' : ''}
                                {item.name}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>

                <TextField
                    label={t('accountancy.unit')}
                    value={category.unit ?? ''}
                    onChange={(e) => setCategory((p) => ({ ...p, unit: e.target.value }))}
                    fullWidth
                    placeholder={t('accountancy.unitPlaceholder')}
                />

                <FormControl fullWidth>
                    <InputLabel>{t('accountancy.divisibility')}</InputLabel>
                    <Select
                        value={category.divisibility ?? ''}
                        label={t('accountancy.divisibility')}
                        onChange={(e) =>
                            setCategory((p) => ({
                                ...p,
                                divisibility: (e.target.value as CategoryDivisibility) || undefined,
                            }))
                        }
                    >
                        <MenuItem value="">—</MenuItem>
                        {DIVISIBILITY_OPTIONS.map((opt) => (
                            <MenuItem key={opt} value={opt}>
                                {opt}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>

                <TextField
                    label={t('accountancy.pricePerUnit')}
                    type="number"
                    value={category.pricePerUnit ?? ''}
                    onChange={(e) =>
                        setCategory((p) => ({
                            ...p,
                            pricePerUnit: e.target.value ? Number(e.target.value) : undefined,
                        }))
                    }
                    fullWidth
                    inputProps={{ min: 0, step: 0.01 }}
                />

                <TextField
                    label={t('accountancy.attributionDate')}
                    type="date"
                    value={category.attributionDate ?? ''}
                    onChange={(e) =>
                        setCategory((p) => ({ ...p, attributionDate: e.target.value || undefined }))
                    }
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                />

                <FormControl fullWidth>
                    <InputLabel>{t('accountancy.isAuto')}</InputLabel>
                    <Select
                        value={category.isAuto === true ? 'auto' : 'notAuto'}
                        label={t('accountancy.isAuto')}
                        onChange={(e) =>
                            setCategory((p) => ({
                                ...p,
                                isAuto: e.target.value === 'auto',
                            }))
                        }
                    >
                        <MenuItem value="auto">{t('accountancy.isAuto')}</MenuItem>
                        <MenuItem value="notAuto">{t('accountancy.isNotAuto')}</MenuItem>
                    </Select>
                </FormControl>

                <FormControl fullWidth>
                    <InputLabel>{t('accountancy.checkInOut')}</InputLabel>
                    <Select
                        value={category.checkInOut ?? ''}
                        label={t('accountancy.checkInOut')}
                        onChange={(e) =>
                            setCategory((p) => ({
                                ...p,
                                checkInOut: (e.target.value as CategoryCheckInOut) || undefined,
                            }))
                        }
                    >
                        <MenuItem value="">—</MenuItem>
                        {CHECK_IN_OUT_OPTIONS.map((opt) => (
                            <MenuItem key={opt.value} value={opt.value}>
                                {t(`accountancy.${opt.labelKey}`)}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>

                <TextField
                    label={t('accountancy.reportingPeriod')}
                    type="date"
                    value={category.reportingPeriod ?? ''}
                    onChange={(e) =>
                        setCategory((p) => ({
                            ...p,
                            reportingPeriod: e.target.value || undefined,
                        }))
                    }
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                />

                <Button
                    variant="contained"
                    endIcon={<SendIcon />}
                    onClick={handleSubmit}
                    disabled={saving}
                >
                    {saving ? t('common.saving') : t('common.save')}
                </Button>
            </Stack>
        </Box>
    );
}
