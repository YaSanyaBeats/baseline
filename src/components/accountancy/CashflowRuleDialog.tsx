'use client';

import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    TextField,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Box,
    IconButton,
    Typography,
    OutlinedInput,
    Chip,
    Stack,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { useState, useEffect } from 'react';
import { useTranslation } from '@/i18n/useTranslation';
import type { CashflowRule, CashflowRuleFilter, CashflowRuleFilterType, UserObject } from '@/lib/types';
import RoomsMultiSelect from '@/components/objectsMultiSelect/RoomsMultiSelect';
import BookingSelectModal from '@/components/bookingsModal/BookingSelectModal';

function newFilterId(): string {
    return `f_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

const METADATA_FIELDS = [
    { value: 'district', labelKey: 'metadataFieldDistrict' },
    { value: 'objectType', labelKey: 'metadataFieldObjectType' },
] as const;

const ROOM_METADATA_FIELDS = [
    { value: 'bedrooms', labelKey: 'roomMetaBedrooms' },
    { value: 'bathrooms', labelKey: 'roomMetaBathrooms' },
    { value: 'livingRoomSofas', labelKey: 'roomMetaLivingRoomSofas' },
    { value: 'kitchen', labelKey: 'roomMetaKitchen' },
    { value: 'level', labelKey: 'roomMetaLevel' },
    { value: 'commissionSchemeId', labelKey: 'roomMetaCommissionScheme' },
    { value: 'internetCostPerMonth', labelKey: 'roomMetaInternetCost' },
    { value: 'internetProviderCounterpartyId', labelKey: 'roomMetaInternetProvider' },
] as const;

const COMPARE_OPERATORS = [
    { value: 'eq', labelKey: 'operatorEq' },
    { value: 'ne', labelKey: 'operatorNe' },
    { value: 'gt', labelKey: 'operatorGt' },
    { value: 'gte', labelKey: 'operatorGte' },
    { value: 'lt', labelKey: 'operatorLt' },
    { value: 'lte', labelKey: 'operatorLte' },
    { value: 'between', labelKey: 'operatorBetween' },
    { value: 'after', labelKey: 'operatorAfter' },
    { value: 'before', labelKey: 'operatorBefore' },
] as const;

/** Объект для выбора района/типа в фильтрах */
export interface ObjectForRuleDialog {
    id: number;
    name?: string;
    district?: string;
    objectType?: string;
}

interface CashflowRuleDialogProps {
    open: boolean;
    onClose: () => void;
    initialRule: CashflowRule | null;
    onSaved: () => void;
    counterparties: { _id: string; name: string }[];
    categories: { _id: string; name: string; type: string }[];
    objects: ObjectForRuleDialog[];
    onSave: (rule: Omit<CashflowRule, '_id' | 'createdAt'> | CashflowRule) => Promise<{ success: boolean; message: string }>;
}

const ROOM_LEVEL_VALUES: { value: string; labelKey: string }[] = [
    { value: 'economy', labelKey: 'levelEconomy' },
    { value: 'comfort', labelKey: 'levelComfort' },
    { value: 'premium', labelKey: 'levelPremium' },
    { value: 'lux', labelKey: 'levelLux' },
];

const KITCHEN_VALUES = [
    { value: 'yes', labelKey: 'kitchenYes' },
    { value: 'no', labelKey: 'kitchenNo' },
] as const;

export default function CashflowRuleDialog({
    open,
    onClose,
    initialRule,
    onSaved,
    counterparties,
    categories,
    objects,
    onSave,
}: CashflowRuleDialogProps) {
    const { t } = useTranslation();
    const [name, setName] = useState('');
    const [filterLogic, setFilterLogic] = useState<'and' | 'or'>('and');
    const [balanceSign, setBalanceSign] = useState<'plus' | 'minus'>('plus');
    const [filters, setFilters] = useState<CashflowRuleFilter[]>([]);
    const [loading, setLoading] = useState(false);
    const [nameError, setNameError] = useState('');
    const [bookingModalFilterId, setBookingModalFilterId] = useState<string | null>(null);

    const uniqueDistricts = [...new Set(objects.map((o) => o.district).filter(Boolean))].sort() as string[];

    const isEdit = Boolean(initialRule?._id);

    useEffect(() => {
        if (open) {
            if (initialRule) {
                setName(initialRule.name);
                setFilterLogic(initialRule.filterLogic);
                setBalanceSign(
                    initialRule.balanceSign === 'plus' || initialRule.balanceSign === 'minus'
                        ? initialRule.balanceSign
                        : initialRule.positiveSign === true
                          ? 'plus'
                          : 'minus'
                );
                setFilters(
                    initialRule.filters?.length
                        ? initialRule.filters.map((f) => ({ ...f, id: f.id || newFilterId() }))
                        : []
                );
            } else {
                setName('');
                setFilterLogic('and');
                setBalanceSign('plus');
                setFilters([]);
            }
            setNameError('');
        }
    }, [open, initialRule]);

    const handleAddFilter = () => {
        setFilters((prev) => [
            ...prev,
            {
                id: newFilterId(),
                type: 'rooms' as CashflowRuleFilterType,
                roomLinks: [],
            },
        ]);
    };

    const handleRemoveFilter = (id: string) => {
        setFilters((prev) => prev.filter((f) => f.id !== id));
    };

    const handleFilterChange = (id: string, patch: Partial<CashflowRuleFilter>) => {
        setFilters((prev) =>
            prev.map((f) => (f.id === id ? { ...f, ...patch } : f))
        );
    };

    const handleBookingSelect = (booking: { id: number }) => {
        if (!bookingModalFilterId) return;
        const filter = filters.find((f) => f.id === bookingModalFilterId);
        if (!filter) return;
        const ids = filter.bookingIds ?? [];
        if (ids.includes(booking.id)) return;
        handleFilterChange(bookingModalFilterId, { bookingIds: [...ids, booking.id] });
        setBookingModalFilterId(null);
    };

    const validate = (): boolean => {
        if (!name.trim()) {
            setNameError(t('accountancy.cashflow.nameRequired'));
            return false;
        }
        setNameError('');
        return true;
    };

    const handleSubmit = async () => {
        if (!validate()) return;

        setLoading(true);
        try {
            const payload = isEdit && initialRule?._id
                ? {
                      _id: initialRule._id,
                      name: name.trim(),
                      filterLogic,
                      filters,
                      balanceSign,
                      createdAt: initialRule.createdAt,
                  }
                : {
                      name: name.trim(),
                      filterLogic,
                      filters,
                      balanceSign,
                  };
            const res = await onSave(payload as CashflowRule);
            if (res.success) {
                onSaved();
                onClose();
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>
                {isEdit ? t('accountancy.cashflow.editRule') : t('accountancy.cashflow.addRule')}
            </DialogTitle>
            <DialogContent>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
                    <TextField
                        label={t('accountancy.cashflow.ruleName')}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        error={Boolean(nameError)}
                        helperText={nameError}
                        fullWidth
                        size="small"
                    />
                    <FormControl size="small" fullWidth>
                        <InputLabel>{t('accountancy.cashflow.filterLogic')}</InputLabel>
                        <Select
                            value={filterLogic}
                            onChange={(e) => setFilterLogic(e.target.value as 'and' | 'or')}
                            label={t('accountancy.cashflow.filterLogic')}
                        >
                            <MenuItem value="and">{t('accountancy.cashflow.filterLogicAnd')}</MenuItem>
                            <MenuItem value="or">{t('accountancy.cashflow.filterLogicOr')}</MenuItem>
                        </Select>
                    </FormControl>
                    <FormControl size="small" sx={{ minWidth: 220 }}>
                        <InputLabel>{t('accountancy.cashflow.balanceSign')}</InputLabel>
                        <Select
                            value={balanceSign}
                            onChange={(e) => setBalanceSign(e.target.value as 'plus' | 'minus')}
                            label={t('accountancy.cashflow.balanceSign')}
                        >
                            <MenuItem value="plus">{t('accountancy.cashflow.balanceSignPlus')}</MenuItem>
                            <MenuItem value="minus">{t('accountancy.cashflow.balanceSignMinus')}</MenuItem>
                        </Select>
                    </FormControl>
                    <Typography variant="subtitle2" color="text.secondary">
                        {t('accountancy.cashflow.filters')}
                    </Typography>
                    {filters.map((filter) => (
                        <Box
                            key={filter.id}
                            sx={{
                                p: 1.5,
                                border: '1px solid',
                                borderColor: 'divider',
                                borderRadius: 1,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 1,
                            }}
                        >
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                                <FormControl size="small" sx={{ minWidth: 180 }}>
                                    <InputLabel>{t('accountancy.cashflow.filterType')}</InputLabel>
                                    <Select
                                        value={filter.type}
                                        onChange={(e) =>
                                            handleFilterChange(filter.id, {
                                                type: e.target.value as CashflowRuleFilterType,
                                                roomLinks: undefined,
                                                metadataField: undefined,
                                                metadataValue: undefined,
                                                counterpartyId: undefined,
                                                sourceOrRecipient: undefined,
                                                categoryNames: undefined,
                                                roomMetadataField: undefined,
                                                roomMetadataOperator: undefined,
                                                roomMetadataValue: undefined,
                                                roomMetadataValueTo: undefined,
                                                hasBooking: undefined,
                                                bookingIds: undefined,
                                                bookingDateField: undefined,
                                                bookingDateOperator: undefined,
                                                bookingDateValue: undefined,
                                                bookingDateValueTo: undefined,
                                                recordDateOperator: undefined,
                                                recordDateValue: undefined,
                                                recordDateValueTo: undefined,
                                                amountOperator: undefined,
                                                amountValue: undefined,
                                                amountValueTo: undefined,
                                                reportMonth: undefined,
                                                reportMonths: undefined,
                                                recordStatus: undefined,
                                                recordType: undefined,
                                            })
                                        }
                                        label={t('accountancy.cashflow.filterType')}
                                    >
                                        <MenuItem value="rooms">{t('accountancy.cashflow.filterTypeRooms')}</MenuItem>
                                        <MenuItem value="metadata">{t('accountancy.cashflow.filterTypeMetadata')}</MenuItem>
                                        <MenuItem value="counterparty">{t('accountancy.cashflow.filterTypeCounterparty')}</MenuItem>
                                        <MenuItem value="category">{t('accountancy.cashflow.filterTypeCategory')}</MenuItem>
                                        <MenuItem value="roomMetadata">{t('accountancy.cashflow.filterTypeRoomMetadata')}</MenuItem>
                                        <MenuItem value="booking">{t('accountancy.cashflow.filterTypeBooking')}</MenuItem>
                                        <MenuItem value="bookingDate">{t('accountancy.cashflow.filterTypeBookingDate')}</MenuItem>
                                        <MenuItem value="recordDate">{t('accountancy.cashflow.filterTypeRecordDate')}</MenuItem>
                                        <MenuItem value="amount">{t('accountancy.cashflow.filterTypeAmount')}</MenuItem>
                                        <MenuItem value="reportMonth">{t('accountancy.cashflow.filterTypeReportMonth')}</MenuItem>
                                        <MenuItem value="status">{t('accountancy.cashflow.filterTypeStatus')}</MenuItem>
                                        <MenuItem value="recordType">{t('accountancy.cashflow.filterTypeRecordType')}</MenuItem>
                                    </Select>
                                </FormControl>
                                <IconButton
                                    size="small"
                                    onClick={() => handleRemoveFilter(filter.id)}
                                    aria-label={t('common.delete')}
                                >
                                    <DeleteIcon fontSize="small" />
                                </IconButton>
                            </Box>
                            {filter.type === 'rooms' && (
                                <RoomsMultiSelect
                                    value={filter.roomLinks ?? []}
                                    onChange={(roomLinks: UserObject[]) =>
                                        handleFilterChange(filter.id, { roomLinks })
                                    }
                                    label={t('accountancy.cashflow.roomsSelect')}
                                />
                            )}
                            {filter.type === 'metadata' && (
                                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                    <FormControl size="small" sx={{ minWidth: 140 }}>
                                        <InputLabel>{t('accountancy.cashflow.metadataField')}</InputLabel>
                                        <Select
                                            value={filter.metadataField ?? 'district'}
                                            onChange={(e) =>
                                                handleFilterChange(filter.id, {
                                                    metadataField: e.target.value as string,
                                                    metadataValue: undefined,
                                                })
                                            }
                                            label={t('accountancy.cashflow.metadataField')}
                                        >
                                            {METADATA_FIELDS.map((f) => (
                                                <MenuItem key={f.value} value={f.value}>
                                                    {t(`accountancy.cashflow.${f.labelKey}`)}
                                                </MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                    {filter.metadataField === 'district' && (
                                        <FormControl size="small" sx={{ minWidth: 180 }}>
                                            <InputLabel>{t('accountancy.cashflow.metadataValue')}</InputLabel>
                                            <Select
                                                value={filter.metadataValue ?? ''}
                                                onChange={(e) =>
                                                    handleFilterChange(filter.id, { metadataValue: e.target.value })
                                                }
                                                label={t('accountancy.cashflow.metadataValue')}
                                            >
                                                <MenuItem value="">—</MenuItem>
                                                {uniqueDistricts.map((d) => (
                                                    <MenuItem key={d} value={d}>
                                                        {d}
                                                    </MenuItem>
                                                ))}
                                            </Select>
                                        </FormControl>
                                    )}
                                    {filter.metadataField === 'objectType' && (
                                        <FormControl size="small" sx={{ minWidth: 180 }}>
                                            <InputLabel>{t('accountancy.cashflow.metadataValue')}</InputLabel>
                                            <Select
                                                value={filter.metadataValue ?? ''}
                                                onChange={(e) =>
                                                    handleFilterChange(filter.id, { metadataValue: e.target.value })
                                                }
                                                label={t('accountancy.cashflow.metadataValue')}
                                            >
                                                <MenuItem value="">—</MenuItem>
                                                <MenuItem value="apartments">{t('dashboard.objectTypeApartments')}</MenuItem>
                                                <MenuItem value="villa">{t('dashboard.objectTypeVilla')}</MenuItem>
                                            </Select>
                                        </FormControl>
                                    )}
                                </Box>
                            )}
                            {filter.type === 'counterparty' && (
                                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                    <FormControl size="small" sx={{ minWidth: 180 }}>
                                        <InputLabel>{t('accountancy.cashflow.counterpartiesSelect')}</InputLabel>
                                        <Select
                                            value={filter.counterpartyId ?? ''}
                                            onChange={(e) =>
                                                handleFilterChange(filter.id, {
                                                    counterpartyId: e.target.value as string,
                                                })
                                            }
                                            label={t('accountancy.cashflow.counterpartiesSelect')}
                                        >
                                            <MenuItem value="">—</MenuItem>
                                            {counterparties.map((cp) => (
                                                <MenuItem key={cp._id} value={cp._id}>
                                                    {cp.name}
                                                </MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                    <FormControl size="small" sx={{ minWidth: 160 }}>
                                        <InputLabel>{t('accountancy.cashflow.sourceOrRecipient')}</InputLabel>
                                        <Select
                                            value={filter.sourceOrRecipient ?? 'both'}
                                            onChange={(e) =>
                                                handleFilterChange(filter.id, {
                                                    sourceOrRecipient: e.target.value as 'source' | 'recipient' | 'both',
                                                })
                                            }
                                            label={t('accountancy.cashflow.sourceOrRecipient')}
                                        >
                                            <MenuItem value="source">{t('accountancy.cashflow.sourceOrRecipientSource')}</MenuItem>
                                            <MenuItem value="recipient">{t('accountancy.cashflow.sourceOrRecipientRecipient')}</MenuItem>
                                            <MenuItem value="both">{t('accountancy.cashflow.sourceOrRecipientBoth')}</MenuItem>
                                        </Select>
                                    </FormControl>
                                </Box>
                            )}
                            {filter.type === 'category' && (
                                <FormControl size="small" fullWidth>
                                    <InputLabel>{t('accountancy.cashflow.categorySelect')}</InputLabel>
                                    <Select
                                        multiple
                                        value={filter.categoryNames ?? []}
                                        onChange={(e) =>
                                            handleFilterChange(filter.id, {
                                                categoryNames: typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value,
                                            })
                                        }
                                        input={<OutlinedInput label={t('accountancy.cashflow.categorySelect')} />}
                                        renderValue={(selected) => selected.join(', ')}
                                    >
                                        {categories.map((c) => (
                                            <MenuItem key={c._id} value={c.name}>
                                                {c.name} ({c.type === 'expense' ? t('accountancy.expense') : t('accountancy.income')})
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            )}
                            {filter.type === 'roomMetadata' && (
                                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                                    <FormControl size="small" sx={{ minWidth: 160 }}>
                                        <InputLabel>{t('accountancy.cashflow.roomMetadataField')}</InputLabel>
                                        <Select
                                            value={filter.roomMetadataField ?? 'bedrooms'}
                                            onChange={(e) =>
                                                handleFilterChange(filter.id, {
                                                    roomMetadataField: e.target.value as string,
                                                    roomMetadataValue: undefined,
                                                    roomMetadataValueTo: undefined,
                                                })
                                            }
                                            label={t('accountancy.cashflow.roomMetadataField')}
                                        >
                                            {ROOM_METADATA_FIELDS.map((f) => (
                                                <MenuItem key={f.value} value={f.value}>
                                                    {t(`accountancy.cashflow.${f.labelKey}`)}
                                                </MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                    <FormControl size="small" sx={{ minWidth: 100 }}>
                                        <InputLabel>{t('accountancy.cashflow.operator')}</InputLabel>
                                        <Select
                                            value={filter.roomMetadataOperator ?? 'eq'}
                                            onChange={(e) =>
                                                handleFilterChange(filter.id, {
                                                    roomMetadataOperator: e.target.value as CashflowRuleFilter['roomMetadataOperator'],
                                                })
                                            }
                                            label={t('accountancy.cashflow.operator')}
                                        >
                                            {COMPARE_OPERATORS.filter((o) => !['after', 'before'].includes(o.value)).map((o) => (
                                                <MenuItem key={o.value} value={o.value}>
                                                    {t(`accountancy.cashflow.${o.labelKey}`)}
                                                </MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                    {filter.roomMetadataField === 'kitchen' && (
                                        <FormControl size="small" sx={{ minWidth: 120 }}>
                                            <InputLabel>{t('accountancy.cashflow.value')}</InputLabel>
                                            <Select
                                                value={filter.roomMetadataValue ?? ''}
                                                onChange={(e) =>
                                                    handleFilterChange(filter.id, { roomMetadataValue: e.target.value })
                                                }
                                                label={t('accountancy.cashflow.value')}
                                            >
                                                {KITCHEN_VALUES.map((k) => (
                                                    <MenuItem key={k.value} value={k.value}>
                                                        {t(`dashboard.${k.labelKey}`)}
                                                    </MenuItem>
                                                ))}
                                            </Select>
                                        </FormControl>
                                    )}
                                    {filter.roomMetadataField === 'level' && (
                                        <FormControl size="small" sx={{ minWidth: 140 }}>
                                            <InputLabel>{t('accountancy.cashflow.value')}</InputLabel>
                                            <Select
                                                value={filter.roomMetadataValue ?? ''}
                                                onChange={(e) =>
                                                    handleFilterChange(filter.id, { roomMetadataValue: e.target.value })
                                                }
                                                label={t('accountancy.cashflow.value')}
                                            >
                                                {ROOM_LEVEL_VALUES.map((l) => (
                                                    <MenuItem key={l.value} value={l.value}>
                                                        {t(`dashboard.${l.labelKey}`)}
                                                    </MenuItem>
                                                ))}
                                            </Select>
                                        </FormControl>
                                    )}
                                    {['bedrooms', 'bathrooms', 'livingRoomSofas'].includes(filter.roomMetadataField ?? '') && (
                                        <FormControl size="small" sx={{ minWidth: 100 }}>
                                            <InputLabel>{t('accountancy.cashflow.value')}</InputLabel>
                                            <Select
                                                value={filter.roomMetadataValue ?? ''}
                                                onChange={(e) =>
                                                    handleFilterChange(filter.id, {
                                                        roomMetadataValue: e.target.value === '' ? undefined : Number(e.target.value),
                                                    })
                                                }
                                                label={t('accountancy.cashflow.value')}
                                            >
                                                {(
                                                    filter.roomMetadataField === 'bedrooms'
                                                        ? [0, 1, 2, 3, 4, 5, 6]
                                                        : filter.roomMetadataField === 'bathrooms'
                                                          ? [0, 1, 2, 3, 4]
                                                          : [0, 1, 2, 3]
                                                ).map((n) => (
                                                    <MenuItem key={n} value={n}>
                                                        {n}
                                                    </MenuItem>
                                                ))}
                                            </Select>
                                        </FormControl>
                                    )}
                                    {filter.roomMetadataField === 'commissionSchemeId' && (
                                        <FormControl size="small" sx={{ minWidth: 120 }}>
                                            <InputLabel>{t('accountancy.cashflow.value')}</InputLabel>
                                            <Select
                                                value={filter.roomMetadataValue ?? ''}
                                                onChange={(e) =>
                                                    handleFilterChange(filter.id, {
                                                        roomMetadataValue: e.target.value === '' ? undefined : Number(e.target.value),
                                                    })
                                                }
                                                label={t('accountancy.cashflow.value')}
                                            >
                                                {[1, 2, 3, 4].map((n) => (
                                                    <MenuItem key={n} value={n}>
                                                        {t('accountancy.cashflow.scheme')} {n}
                                                    </MenuItem>
                                                ))}
                                            </Select>
                                        </FormControl>
                                    )}
                                    {filter.roomMetadataField === 'internetCostPerMonth' && (
                                        <FormControl size="small" sx={{ minWidth: 140 }}>
                                            <InputLabel>{t('accountancy.cashflow.value')}</InputLabel>
                                            <Select
                                                value={filter.roomMetadataValue ?? ''}
                                                onChange={(e) =>
                                                    handleFilterChange(filter.id, {
                                                        roomMetadataValue: e.target.value === '' ? undefined : Number(e.target.value),
                                                    })
                                                }
                                                label={t('accountancy.cashflow.value')}
                                            >
                                                {[0, 500, 1000, 1500, 2000, 2500, 3000].map((n) => (
                                                    <MenuItem key={n} value={n}>
                                                        {n}
                                                    </MenuItem>
                                                ))}
                                            </Select>
                                        </FormControl>
                                    )}
                                    {filter.roomMetadataField === 'internetProviderCounterpartyId' && (
                                        <FormControl size="small" sx={{ minWidth: 200 }}>
                                            <InputLabel>{t('accountancy.cashflow.value')}</InputLabel>
                                            <Select
                                                value={filter.roomMetadataValue ?? ''}
                                                onChange={(e) =>
                                                    handleFilterChange(filter.id, {
                                                        roomMetadataValue:
                                                            e.target.value === '' ? undefined : String(e.target.value),
                                                    })
                                                }
                                                label={t('accountancy.cashflow.value')}
                                            >
                                                <MenuItem value="">—</MenuItem>
                                                {counterparties.map((c) => (
                                                    <MenuItem key={c._id} value={c._id}>
                                                        {c.name}
                                                    </MenuItem>
                                                ))}
                                            </Select>
                                        </FormControl>
                                    )}
                                    {filter.roomMetadataOperator === 'between' &&
                                        ['bedrooms', 'bathrooms', 'livingRoomSofas', 'commissionSchemeId', 'internetCostPerMonth'].includes(
                                            filter.roomMetadataField ?? ''
                                        ) && (
                                            <FormControl size="small" sx={{ minWidth: 100 }}>
                                                <InputLabel>{t('accountancy.cashflow.valueTo')}</InputLabel>
                                                <Select
                                                    value={filter.roomMetadataValueTo ?? ''}
                                                    onChange={(e) =>
                                                        handleFilterChange(filter.id, {
                                                            roomMetadataValueTo:
                                                                e.target.value === '' ? undefined : Number(e.target.value),
                                                        })
                                                    }
                                                    label={t('accountancy.cashflow.valueTo')}
                                                >
                                                    {(
                                                        filter.roomMetadataField === 'bedrooms'
                                                            ? [0, 1, 2, 3, 4, 5, 6]
                                                            : filter.roomMetadataField === 'bathrooms'
                                                              ? [0, 1, 2, 3, 4]
                                                              : filter.roomMetadataField === 'livingRoomSofas'
                                                                ? [0, 1, 2, 3]
                                                                : filter.roomMetadataField === 'commissionSchemeId'
                                                                  ? [1, 2, 3, 4]
                                                                  : [0, 500, 1000, 1500, 2000, 2500, 3000]
                                                    ).map((n) => (
                                                        <MenuItem key={n} value={n}>
                                                            {n}
                                                        </MenuItem>
                                                    ))}
                                                </Select>
                                            </FormControl>
                                        )}
                                </Box>
                            )}
                            {filter.type === 'booking' && (
                                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                                    <FormControl size="small" sx={{ minWidth: 200 }}>
                                        <InputLabel>{t('accountancy.cashflow.bookingCondition')}</InputLabel>
                                        <Select
                                            value={
                                                filter.hasBooking === true
                                                    ? 'has'
                                                    : filter.hasBooking === false
                                                      ? 'no'
                                                      : 'ids'
                                            }
                                            onChange={(e) => {
                                                const v = e.target.value;
                                                handleFilterChange(filter.id, {
                                                    hasBooking: v === 'has' ? true : v === 'no' ? false : undefined,
                                                    bookingIds: v === 'ids' ? (filter.bookingIds ?? []) : undefined,
                                                });
                                            }}
                                            label={t('accountancy.cashflow.bookingCondition')}
                                        >
                                            <MenuItem value="has">{t('accountancy.cashflow.bookingHas')}</MenuItem>
                                            <MenuItem value="no">{t('accountancy.cashflow.bookingNo')}</MenuItem>
                                            <MenuItem value="ids">{t('accountancy.cashflow.bookingIds')}</MenuItem>
                                        </Select>
                                    </FormControl>
                                    {filter.hasBooking === undefined && (
                                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
                                            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                                                {(filter.bookingIds ?? []).map((bid) => (
                                                    <Chip
                                                        key={bid}
                                                        size="small"
                                                        label={`#${bid}`}
                                                        onDelete={() =>
                                                            handleFilterChange(filter.id, {
                                                                bookingIds: (filter.bookingIds ?? []).filter((id) => id !== bid),
                                                            })
                                                        }
                                                    />
                                                ))}
                                            </Stack>
                                            <Button
                                                variant="outlined"
                                                size="small"
                                                onClick={() => setBookingModalFilterId(filter.id)}
                                            >
                                                {t('accountancy.selectBooking')}
                                            </Button>
                                        </Box>
                                    )}
                                </Box>
                            )}
                            {filter.type === 'bookingDate' && (
                                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                    <FormControl size="small" sx={{ minWidth: 120 }}>
                                        <InputLabel>{t('accountancy.cashflow.bookingDateField')}</InputLabel>
                                        <Select
                                            value={filter.bookingDateField ?? 'arrival'}
                                            onChange={(e) =>
                                                handleFilterChange(filter.id, {
                                                    bookingDateField: e.target.value as 'arrival' | 'departure',
                                                })
                                            }
                                            label={t('accountancy.cashflow.bookingDateField')}
                                        >
                                            <MenuItem value="arrival">{t('accountancy.cashflow.bookingArrival')}</MenuItem>
                                            <MenuItem value="departure">{t('accountancy.cashflow.bookingDeparture')}</MenuItem>
                                        </Select>
                                    </FormControl>
                                    <FormControl size="small" sx={{ minWidth: 100 }}>
                                        <InputLabel>{t('accountancy.cashflow.operator')}</InputLabel>
                                        <Select
                                            value={filter.bookingDateOperator ?? 'eq'}
                                            onChange={(e) =>
                                                handleFilterChange(filter.id, {
                                                    bookingDateOperator: e.target.value as CashflowRuleFilter['bookingDateOperator'],
                                                })
                                            }
                                            label={t('accountancy.cashflow.operator')}
                                        >
                                            {COMPARE_OPERATORS.map((o) => (
                                                <MenuItem key={o.value} value={o.value}>
                                                    {t(`accountancy.cashflow.${o.labelKey}`)}
                                                </MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                    <TextField
                                        size="small"
                                        type="date"
                                        label={t('accountancy.cashflow.dateValue')}
                                        value={filter.bookingDateValue ?? ''}
                                        onChange={(e) =>
                                            handleFilterChange(filter.id, { bookingDateValue: e.target.value })
                                        }
                                        InputLabelProps={{ shrink: true }}
                                        sx={{ width: 160 }}
                                    />
                                    {filter.bookingDateOperator === 'between' && (
                                        <TextField
                                            size="small"
                                            type="date"
                                            label={t('accountancy.cashflow.dateValueTo')}
                                            value={filter.bookingDateValueTo ?? ''}
                                            onChange={(e) =>
                                                handleFilterChange(filter.id, { bookingDateValueTo: e.target.value })
                                            }
                                            InputLabelProps={{ shrink: true }}
                                            sx={{ width: 160 }}
                                        />
                                    )}
                                </Box>
                            )}
                            {filter.type === 'recordDate' && (
                                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                    <FormControl size="small" sx={{ minWidth: 100 }}>
                                        <InputLabel>{t('accountancy.cashflow.operator')}</InputLabel>
                                        <Select
                                            value={filter.recordDateOperator ?? 'eq'}
                                            onChange={(e) =>
                                                handleFilterChange(filter.id, {
                                                    recordDateOperator: e.target.value as CashflowRuleFilter['recordDateOperator'],
                                                })
                                            }
                                            label={t('accountancy.cashflow.operator')}
                                        >
                                            {COMPARE_OPERATORS.map((o) => (
                                                <MenuItem key={o.value} value={o.value}>
                                                    {t(`accountancy.cashflow.${o.labelKey}`)}
                                                </MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                    <TextField
                                        size="small"
                                        type="date"
                                        label={t('accountancy.cashflow.dateValue')}
                                        value={filter.recordDateValue ?? ''}
                                        onChange={(e) =>
                                            handleFilterChange(filter.id, { recordDateValue: e.target.value })
                                        }
                                        InputLabelProps={{ shrink: true }}
                                        sx={{ width: 160 }}
                                    />
                                    {filter.recordDateOperator === 'between' && (
                                        <TextField
                                            size="small"
                                            type="date"
                                            label={t('accountancy.cashflow.dateValueTo')}
                                            value={filter.recordDateValueTo ?? ''}
                                            onChange={(e) =>
                                                handleFilterChange(filter.id, { recordDateValueTo: e.target.value })
                                            }
                                            InputLabelProps={{ shrink: true }}
                                            sx={{ width: 160 }}
                                        />
                                    )}
                                </Box>
                            )}
                            {filter.type === 'amount' && (
                                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                    <FormControl size="small" sx={{ minWidth: 100 }}>
                                        <InputLabel>{t('accountancy.cashflow.operator')}</InputLabel>
                                        <Select
                                            value={filter.amountOperator ?? 'eq'}
                                            onChange={(e) =>
                                                handleFilterChange(filter.id, {
                                                    amountOperator: e.target.value as CashflowRuleFilter['amountOperator'],
                                                })
                                            }
                                            label={t('accountancy.cashflow.operator')}
                                        >
                                            {COMPARE_OPERATORS.filter((o) => !['after', 'before'].includes(o.value)).map((o) => (
                                                <MenuItem key={o.value} value={o.value}>
                                                    {t(`accountancy.cashflow.${o.labelKey}`)}
                                                </MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                    <TextField
                                        size="small"
                                        type="number"
                                        label={t('accountancy.cashflow.amountValue')}
                                        value={filter.amountValue ?? ''}
                                        onChange={(e) =>
                                            handleFilterChange(filter.id, {
                                                amountValue: e.target.value === '' ? undefined : Number(e.target.value),
                                            })
                                        }
                                        inputProps={{ min: 0, step: 0.01 }}
                                        sx={{ width: 120 }}
                                    />
                                    {filter.amountOperator === 'between' && (
                                        <TextField
                                            size="small"
                                            type="number"
                                            label={t('accountancy.cashflow.valueTo')}
                                            value={filter.amountValueTo ?? ''}
                                            onChange={(e) =>
                                                handleFilterChange(filter.id, {
                                                    amountValueTo: e.target.value === '' ? undefined : Number(e.target.value),
                                                })
                                            }
                                            inputProps={{ min: 0, step: 0.01 }}
                                            sx={{ width: 120 }}
                                        />
                                    )}
                                </Box>
                            )}
                            {filter.type === 'reportMonth' && (
                                <TextField
                                    size="small"
                                    type="month"
                                    label={t('accountancy.cashflow.reportMonthValue')}
                                    value={filter.reportMonth ?? ''}
                                    onChange={(e) =>
                                        handleFilterChange(filter.id, { reportMonth: e.target.value || undefined })
                                    }
                                    InputLabelProps={{ shrink: true }}
                                    sx={{ minWidth: 180 }}
                                />
                            )}
                            {filter.type === 'status' && (
                                <FormControl size="small" sx={{ minWidth: 160 }}>
                                    <InputLabel>{t('accountancy.cashflow.statusValue')}</InputLabel>
                                    <Select
                                        value={filter.recordStatus ?? 'confirmed'}
                                        onChange={(e) =>
                                            handleFilterChange(filter.id, {
                                                recordStatus: e.target.value as 'draft' | 'confirmed',
                                            })
                                        }
                                        label={t('accountancy.cashflow.statusValue')}
                                    >
                                        <MenuItem value="draft">{t('accountancy.cashflow.statusDraft')}</MenuItem>
                                        <MenuItem value="confirmed">{t('accountancy.cashflow.statusConfirmed')}</MenuItem>
                                    </Select>
                                </FormControl>
                            )}
                            {filter.type === 'recordType' && (
                                <FormControl size="small" sx={{ minWidth: 160 }}>
                                    <InputLabel>{t('accountancy.cashflow.recordTypeValue')}</InputLabel>
                                    <Select
                                        value={filter.recordType ?? 'expense'}
                                        onChange={(e) =>
                                            handleFilterChange(filter.id, {
                                                recordType: e.target.value as 'expense' | 'income',
                                            })
                                        }
                                        label={t('accountancy.cashflow.recordTypeValue')}
                                    >
                                        <MenuItem value="expense">{t('accountancy.expense')}</MenuItem>
                                        <MenuItem value="income">{t('accountancy.income')}</MenuItem>
                                    </Select>
                                </FormControl>
                            )}
                        </Box>
                    ))}
                    <Button
                        variant="outlined"
                        startIcon={<AddIcon />}
                        onClick={handleAddFilter}
                        size="small"
                    >
                        {t('accountancy.cashflow.addFilter')}
                    </Button>
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>{t('common.cancel')}</Button>
                <Button variant="contained" onClick={handleSubmit} disabled={loading}>
                    {t('common.save')}
                </Button>
            </DialogActions>
        </Dialog>
        <BookingSelectModal
            open={bookingModalFilterId !== null}
            onClose={() => setBookingModalFilterId(null)}
            onSelect={handleBookingSelect}
        />
    </>
    );
}
