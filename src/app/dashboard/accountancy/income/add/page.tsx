'use client'

import {
    Box,
    Button,
    FormControl,
    IconButton,
    InputLabel,
    MenuItem,
    Select,
    Stack,
    TextField,
    Typography,
    Alert,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
} from "@mui/material"
import SendIcon from '@mui/icons-material/Send';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import Link from 'next/link';
import { useEffect, useState } from "react";
import { AccountancyCategory, AccountancyAttachment, Income, UserObject } from "@/lib/types";
import { addIncome } from "@/lib/incomes";
import FileAttachments from "@/components/accountancy/FileAttachments";
import { useSnackbar } from "@/providers/SnackbarContext";
import { useUser } from "@/providers/UserProvider";
import { useTranslation } from "@/i18n/useTranslation";
import { useRouter } from 'next/navigation';
import RoomsMultiSelect from "@/components/objectsMultiSelect/RoomsMultiSelect";
import BookingSelectModal from "@/components/bookingsModal/BookingSelectModal";
import { getAccountancyCategories } from "@/lib/accountancyCategories";

type IncomeItemForm = {
    category: string;
    amount: number | undefined;
    date: string;
    attachments: AccountancyAttachment[];
};

const defaultIncomeItem: IncomeItemForm = {
    category: '',
    amount: undefined,
    date: '',
    attachments: [],
};

export default function Page() {
    const { t } = useTranslation();
    const router = useRouter();
    const { isAdmin, isAccountant } = useUser();
    const [selectedObjects, setSelectedObjects] = useState<UserObject[]>([]);
    const [objectId, setObjectId] = useState<number | undefined>();
    const [roomId, setRoomId] = useState<number | undefined>();
    const [bookingId, setBookingId] = useState<number | undefined>();
    const [items, setItems] = useState<IncomeItemForm[]>([{ ...defaultIncomeItem }]);
    const [bookingModalOpen, setBookingModalOpen] = useState(false);
    const [categories, setCategories] = useState<AccountancyCategory[]>([]);
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const { setSnackbar } = useSnackbar();

    const hasAccess = isAdmin || isAccountant;

    useEffect(() => {
        if (!hasAccess) return;
        getAccountancyCategories('income')
            .then(setCategories)
            .catch((error) => {
                console.error('Error loading categories:', error);
            });
    }, [hasAccess]);

    const handleChangeObject = (value: UserObject[]) => {
        setSelectedObjects(value);
        const objId = value.length > 0 ? value[0].id : undefined;
        const rId = value.length > 0 && value[0].rooms.length > 0 ? value[0].rooms[0] : undefined;
        setObjectId(objId);
        setRoomId(rId);
        setErrors((prev) => {
            const newErrors = { ...prev };
            if (objId) delete newErrors.objectId;
            return newErrors;
        });
    };

    const handleAddItem = () => {
        setItems((prev) => [...prev, { ...defaultIncomeItem }]);
    };

    const handleRemoveItem = (index: number) => {
        if (items.length <= 1) return;
        setItems((prev) => prev.filter((_, i) => i !== index));
    };

    const handleChangeItem = (index: number, field: keyof IncomeItemForm, value: unknown) => {
        setItems((prev) =>
            prev.map((item, i) =>
                i === index ? { ...item, [field]: value } : item
            )
        );
        setErrors((prev) => {
            const newErrors = { ...prev };
            delete newErrors[`item_${index}_${field}`];
            return newErrors;
        });
    };

    const handleChangeItemAmount = (index: number, event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const value = event.target.value;
        const num = Number(value);
        handleChangeItem(index, 'amount', isNaN(num) ? undefined : num);
    };

    const validate = (): boolean => {
        const validationErrors: Record<string, string> = {};

        if (!objectId) {
            validationErrors.objectId = t('accountancy.objectError');
        }

        items.forEach((item, index) => {
            if (!item.category) {
                validationErrors[`item_${index}_category`] = t('accountancy.category');
            }
            if (!item.date) {
                validationErrors[`item_${index}_date`] = t('accountancy.incomeDate');
            }
            if (!item.amount || item.amount <= 0) {
                validationErrors[`item_${index}_amount`] = t('accountancy.amount');
            }
        });

        if (Object.keys(validationErrors).length > 0) {
            setErrors(validationErrors);
            setSnackbar({
                open: true,
                message: t('accountancy.formErrors'),
                severity: 'error',
            });
            return false;
        }

        return true;
    };

    const handleOpenBookingModal = () => setBookingModalOpen(true);
    const handleCloseBookingModal = () => setBookingModalOpen(false);

    const handleBookingSelect = (booking: { id: number }) => {
        setBookingId(booking.id);
    };

    const handleDetachBooking = () => {
        setBookingId(undefined);
    };

    const handleSubmit = async () => {
        if (!validate() || !objectId) return;

        setLoading(true);
        let successCount = 0;
        let failCount = 0;

        try {
            for (const item of items) {
                const payload: Income = {
                    objectId,
                    roomId,
                    bookingId,
                    category: item.category,
                    amount: item.amount as number,
                    date: new Date(item.date),
                    status: 'draft',
                    attachments: item.attachments ?? [],
                    accountantId: '',
                };

                try {
                    const res = await addIncome(payload);
                    if (res.success) successCount++;
                    else failCount++;
                } catch {
                    failCount++;
                }
            }

            const message =
                failCount === 0
                    ? `${t('accountancy.incomesAdded')}: ${successCount}`
                    : `${t('accountancy.incomesAddedPartial')} (${successCount}/${successCount + failCount})`;

            setSnackbar({
                open: true,
                message,
                severity: failCount === 0 ? 'success' : 'warning',
            });

            if (successCount > 0) {
                router.push('/dashboard/accountancy/income');
            }
        } catch (error) {
            console.error('Error adding incomes:', error);
            setSnackbar({
                open: true,
                message: t('common.serverError'),
                severity: 'error',
            });
        } finally {
            setLoading(false);
        }
    };

    if (!hasAccess) {
        return (
            <Box>
                <Typography variant="h4">{t('accountancy.addIncome')}</Typography>
                <Alert severity="warning" sx={{ mt: 2 }}>
                    {t('accountancy.noAccess')}
                </Alert>
            </Box>
        );
    }

    return (
        <>
            <form noValidate autoComplete="off">
                <Typography variant="h4">{t('accountancy.addIncome')}</Typography>

                <Paper variant="outlined" sx={{ p: 2, mt: 2, mb: 2 }}>
                    <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2 }}>
                        {t('accountancy.commonForAllItems')}
                    </Typography>
                    <Stack direction="column" spacing={2} sx={{ maxWidth: '500px' }}>
                        <Box>
                            <RoomsMultiSelect
                                value={selectedObjects}
                                onChange={handleChangeObject}
                                label={t('accountancy.object')}
                                multiple={false}
                            />
                            {errors.objectId && (
                                <Typography variant="caption" color="error" sx={{ mt: 0.5, ml: 1.75 }}>
                                    {errors.objectId}
                                </Typography>
                            )}
                        </Box>
                        <Box>
                            <Stack direction="row" spacing={2} alignItems="center">
                                <Button
                                    variant="outlined"
                                    onClick={handleOpenBookingModal}
                                >
                                    {t('accountancy.selectBooking')}
                                </Button>
                                {bookingId && (
                                    <>
                                        <Typography variant="body2" color="text.secondary">
                                            {t('accountancy.bookingId')}: {bookingId}
                                        </Typography>
                                        <IconButton
                                            size="small"
                                            color="secondary"
                                            onClick={handleDetachBooking}
                                            title={t('accountancy.detachBooking')}
                                            aria-label={t('accountancy.detachBooking')}
                                        >
                                            <CloseIcon fontSize="small" />
                                        </IconButton>
                                    </>
                                )}
                            </Stack>
                        </Box>
                    </Stack>
                </Paper>

                <Typography variant="subtitle1" sx={{ mb: 1 }}>
                    {t('accountancy.itemsToAdd')}
                </Typography>
                <Box sx={{ overflowX: 'auto', mb: 2 }}>
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell width={40}></TableCell>
                            <TableCell>{t('accountancy.category')}</TableCell>
                            <TableCell>{t('accountancy.amount')}</TableCell>
                            <TableCell>{t('accountancy.incomeDate')}</TableCell>
                            <TableCell>{t('accountancy.attachments')}</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {items.map((item, index) => (
                            <TableRow key={index}>
                                <TableCell>
                                    <IconButton
                                        size="small"
                                        onClick={() => handleRemoveItem(index)}
                                        disabled={items.length <= 1}
                                        aria-label={t('accountancy.removeItem')}
                                    >
                                        <DeleteOutlineIcon fontSize="small" />
                                    </IconButton>
                                </TableCell>
                                <TableCell>
                                    <FormControl size="small" sx={{ minWidth: 160 }} error={!!errors[`item_${index}_category`]}>
                                        <InputLabel>{t('accountancy.category')}</InputLabel>
                                        <Select
                                            value={item.category || ''}
                                            label={t('accountancy.category')}
                                            onChange={(e) =>
                                                handleChangeItem(index, 'category', e.target.value as string)
                                            }
                                        >
                                            {categories.map((cat) => (
                                                <MenuItem key={cat._id || cat.name} value={cat.name}>
                                                    {cat.name}
                                                </MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                </TableCell>
                                <TableCell>
                                    <TextField
                                        size="small"
                                        type="number"
                                        value={item.amount ?? ''}
                                        onChange={(e) => handleChangeItemAmount(index, e)}
                                        error={!!errors[`item_${index}_amount`]}
                                        inputProps={{ min: 0, step: 0.01 }}
                                        sx={{ width: 120 }}
                                    />
                                </TableCell>
                                <TableCell>
                                    <TextField
                                        size="small"
                                        type="date"
                                        InputLabelProps={{ shrink: true }}
                                        value={item.date || ''}
                                        onChange={(e) =>
                                            handleChangeItem(index, 'date', e.target.value)
                                        }
                                        error={!!errors[`item_${index}_date`]}
                                        sx={{ width: 150 }}
                                    />
                                </TableCell>
                                <TableCell>
                                    <FileAttachments
                                        value={item.attachments ?? []}
                                        onChange={(attachments: AccountancyAttachment[]) =>
                                            handleChangeItem(index, 'attachments', attachments)
                                        }
                                        disabled={loading}
                                    />
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
                </Box>

                <Button
                    variant="outlined"
                    startIcon={<AddIcon />}
                    onClick={handleAddItem}
                    sx={{ mb: 2 }}
                >
                    {t('accountancy.addItem')}
                </Button>

                <Stack direction="row" spacing={2} mt={2}>
                    <Link href="/dashboard/accountancy/income">
                        <Button variant="outlined" startIcon={<ArrowBackIcon />}>
                            {t('common.cancel')}
                        </Button>
                    </Link>
                    <Button
                        variant="contained"
                        endIcon={<SendIcon />}
                        onClick={handleSubmit}
                        disabled={loading}
                    >
                        {t('common.send')}
                    </Button>
                </Stack>
            </form>
            <BookingSelectModal
                open={bookingModalOpen}
                onClose={handleCloseBookingModal}
                onSelect={handleBookingSelect}
                initialObjectId={objectId}
            />
        </>
    );
}
