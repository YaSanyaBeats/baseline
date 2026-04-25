'use client';

import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { memo } from 'react';
import {
    Box,
    Chip,
    FormControl,
    IconButton,
    MenuItem,
    Select,
    Stack,
    Switch,
    TableCell,
    TableRow,
    TextField,
    Tooltip,
} from '@mui/material';
import { Delete as DeleteIcon, Visibility } from '@mui/icons-material';
import Link from 'next/link';
import type { CategorySelectItem } from '@/lib/accountancyCategoryUtils';
import SourceRecipientSelect, {
    type SourceRecipientAutocompleteOption,
    type SourceRecipientOptionValue,
} from './SourceRecipientSelect';

/** Строка операции в сводке /dashboard/accountancy (таблица без брони / с бронью). */
export type AccountancyOverviewOperationRowModel = {
    id: string;
    type: 'expense' | 'income';
    entityId: string;
    status: 'draft' | 'confirmed';
    date: Date | string;
    category: string;
    comment: string;
    quantity: number;
    amount: number;
    reportMonth: string;
    source?: string;
    recipient?: string;
    autoCreated?: boolean;
    bookingId?: number;
};

export type AccountancyOverviewOperationTableRowProps = {
    row: AccountancyOverviewOperationRowModel;
    t: (key: string) => string;
    opTableSelectFormSx: object;
    opTableCatSelectFormSx: object;
    opTableQtySelectFormSx: object;
    opTableSelectSx: object;
    opTableInlineSelectSx: object;
    opTableSourceRecipientSx: object;
    OP_TABLE_COMMENT_COL_WIDTH_PX: number;
    handleStatusToggle: (row: AccountancyOverviewOperationRowModel) => void;
    statusUpdatingId: string | null;
    inlinePatchUpdatingId: string | null;
    handleReportMonthChange: (row: AccountancyOverviewOperationRowModel, value: string) => void;
    reportMonthUpdatingId: string | null;
    reportMonthOptions: { value: string; label: string }[];
    categoryItemsExpense: CategorySelectItem[];
    categoryItemsIncome: CategorySelectItem[];
    sourceRecipientOptions: SourceRecipientAutocompleteOption[];
    recipientRecipientOptions: SourceRecipientAutocompleteOption[];
    handleCategoryChange: (row: AccountancyOverviewOperationRowModel, value: string) => void | Promise<void>;
    quantityUpdatingId: string | null;
    commentDraftByRowId: Record<string, string>;
    setCommentDraftByRowId: Dispatch<SetStateAction<Record<string, string>>>;
    handleCommentCommit: (row: AccountancyOverviewOperationRowModel, draft: string) => void | Promise<void>;
    quantityOptions: number[];
    handleQuantityChange: (row: AccountancyOverviewOperationRowModel, q: number) => void | Promise<void>;
    amountEditingId: string | null;
    amountDraft: string;
    setAmountDraft: (v: string) => void;
    setAmountEditingId: (id: string | null) => void;
    amountEditEscapeRef: MutableRefObject<boolean>;
    handleOperationAmountCommit: (row: AccountancyOverviewOperationRowModel, raw: string) => void | Promise<void>;
    amountUpdatingId: string | null;
    formatAmount: (n: number) => string;
    handleSourceChange: (row: AccountancyOverviewOperationRowModel, v: SourceRecipientOptionValue) => void | Promise<void>;
    handleRecipientChange: (row: AccountancyOverviewOperationRowModel, v: SourceRecipientOptionValue) => void | Promise<void>;
    counterparties: { _id: string; name: string }[];
    usersWithCashflow: { _id: string; name: string }[];
    cashflows: { _id: string; name: string }[];
    operationDeletingId: string | null;
    handleOperationDeleteClick: (row: AccountancyOverviewOperationRowModel) => void;
};

function AccountancyOverviewOperationTableRowInner(p: AccountancyOverviewOperationTableRowProps) {
    const { row, t } = p;
    return (
        <TableRow
            sx={
                row.autoCreated
                    ? {
                          bgcolor: (theme) =>
                              theme.palette.mode === 'light'
                                  ? 'rgba(46, 125, 50, 0.06)'
                                  : 'rgba(102, 187, 106, 0.1)',
                      }
                    : undefined
            }
        >
            <TableCell sx={{ px: 0.25 }}>
                <Tooltip title={row.status === 'confirmed' ? t('accountancy.statusConfirmed') : t('accountancy.statusDraft')}>
                    <Switch
                        checked={row.status === 'confirmed'}
                        onChange={() => p.handleStatusToggle(row)}
                        disabled={p.statusUpdatingId === row.id || p.inlinePatchUpdatingId === row.id}
                        size="small"
                        color="primary"
                    />
                </Tooltip>
            </TableCell>
            <TableCell sx={{ px: 0.25 }}>
                <FormControl size="small" sx={p.opTableSelectFormSx}>
                    <Select
                        sx={p.opTableSelectSx}
                        value={row.reportMonth || ''}
                        displayEmpty
                        onChange={(e) => p.handleReportMonthChange(row, e.target.value as string)}
                        disabled={p.reportMonthUpdatingId === row.id || p.inlinePatchUpdatingId === row.id}
                        MenuProps={{ PaperProps: { sx: { maxHeight: 280 } } }}
                    >
                        <MenuItem value="">
                            <em>—</em>
                        </MenuItem>
                        {p.reportMonthOptions.map((o) => (
                            <MenuItem key={o.value} value={o.value}>
                                {o.label}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
            </TableCell>
            <TableCell sx={{ px: 0.25, pl: 1, fontSize: '0.6875rem', whiteSpace: 'nowrap' }}>
                {row.date
                    ? new Date(row.date).toLocaleDateString('ru-RU', {
                          day: '2-digit',
                          month: '2-digit',
                          year: '2-digit',
                      })
                    : '—'}
            </TableCell>
            <TableCell sx={{ px: 0.25, overflow: 'hidden' }}>
                <Stack direction="row" alignItems="center" spacing={0.5} flexWrap="nowrap" sx={{ minWidth: 0 }}>
                    <FormControl size="small" sx={{ ...p.opTableCatSelectFormSx, flexShrink: 0 }}>
                        <Select
                            sx={p.opTableInlineSelectSx}
                            IconComponent={() => null}
                            value={row.category || ''}
                            displayEmpty
                            onChange={(e) => void p.handleCategoryChange(row, e.target.value as string)}
                            disabled={
                                p.inlinePatchUpdatingId === row.id ||
                                p.quantityUpdatingId === row.id ||
                                p.reportMonthUpdatingId === row.id ||
                                p.statusUpdatingId === row.id
                            }
                            MenuProps={{ PaperProps: { sx: { maxHeight: 280 } } }}
                        >
                            <MenuItem value="">
                                <em>—</em>
                            </MenuItem>
                            {(() => {
                                const items =
                                    row.type === 'expense' ? p.categoryItemsExpense : p.categoryItemsIncome;
                                const names = new Set(items.map((it) => it.name));
                                const orphan = !!(row.category && !names.has(row.category));
                                return [
                                    ...(orphan
                                        ? [
                                              <MenuItem key={`orphan-${row.id}`} value={row.category}>
                                                  {row.category}
                                              </MenuItem>,
                                          ]
                                        : []),
                                    ...items.map((item) => (
                                        <MenuItem key={item.id} value={item.name}>
                                            {item.depth > 0
                                                ? '\u00A0'.repeat(item.depth * 2) + '↳ '
                                                : ''}
                                            {item.name}
                                        </MenuItem>
                                    )),
                                ];
                            })()}
                        </Select>
                    </FormControl>
                    {row.autoCreated && (
                        <Tooltip title={t('accountancy.autoAccounting.autoCreatedBadge')}>
                            <Chip
                                size="small"
                                label={t('accountancy.autoAccounting.autoCreatedBadge')}
                                color="success"
                                variant="outlined"
                                sx={{
                                    height: 22,
                                    flexShrink: 0,
                                    maxWidth: 'none',
                                    '& .MuiChip-label': {
                                        px: 0.5,
                                        fontSize: '0.6rem',
                                        lineHeight: 1.2,
                                    },
                                }}
                            />
                        </Tooltip>
                    )}
                </Stack>
            </TableCell>
            <TableCell
                sx={{
                    px: 0.25,
                    minWidth: p.OP_TABLE_COMMENT_COL_WIDTH_PX,
                    width: p.OP_TABLE_COMMENT_COL_WIDTH_PX,
                }}
            >
                <TextField
                    size="small"
                    fullWidth
                    value={
                        p.commentDraftByRowId[row.id] !== undefined
                            ? p.commentDraftByRowId[row.id]!
                            : row.comment
                    }
                    onChange={(e) =>
                        p.setCommentDraftByRowId((prev) => ({
                            ...prev,
                            [row.id]: e.target.value,
                        }))
                    }
                    onBlur={() => {
                        const draft = p.commentDraftByRowId[row.id];
                        if (draft === undefined) return;
                        p.setCommentDraftByRowId((prev) => {
                            const next = { ...prev };
                            delete next[row.id];
                            return next;
                        });
                        void p.handleCommentCommit(row, draft);
                    }}
                    placeholder={t('accountancy.comment')}
                    disabled={
                        p.inlinePatchUpdatingId === row.id ||
                        p.quantityUpdatingId === row.id ||
                        p.reportMonthUpdatingId === row.id ||
                        p.statusUpdatingId === row.id
                    }
                    slotProps={{
                        htmlInput: {
                            'aria-label': t('accountancy.comment'),
                        },
                    }}
                    sx={{
                        '& .MuiInputBase-input': {
                            fontSize: '0.6875rem',
                            py: '3px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        },
                    }}
                />
            </TableCell>
            <TableCell sx={{ px: 0.25 }}>
                <FormControl size="small" sx={p.opTableQtySelectFormSx}>
                    <Select
                        sx={p.opTableSelectSx}
                        value={row.quantity}
                        onChange={(e) => p.handleQuantityChange(row, Number(e.target.value))}
                        disabled={p.quantityUpdatingId === row.id || p.inlinePatchUpdatingId === row.id}
                        MenuProps={{ PaperProps: { sx: { maxHeight: 280 } } }}
                    >
                        {!p.quantityOptions.includes(row.quantity) && row.quantity >= 1 ? (
                            <MenuItem key={`qty-outofrange-${row.id}`} value={row.quantity}>
                                {row.quantity}
                            </MenuItem>
                        ) : null}
                        {p.quantityOptions.map((q) => (
                            <MenuItem key={q} value={q}>
                                {q}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
            </TableCell>
            <TableCell
                sx={{
                    px: 0.25,
                    color: row.amount >= 0 ? 'success.main' : 'error.main',
                    verticalAlign: 'middle',
                    fontSize: '0.6875rem',
                }}
            >
                {p.amountEditingId === row.id ? (
                    <TextField
                        size="small"
                        value={p.amountDraft}
                        onChange={(e) => p.setAmountDraft(e.target.value)}
                        onBlur={(e) => void p.handleOperationAmountCommit(row, e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                (e.target as HTMLInputElement).blur();
                            } else if (e.key === 'Escape') {
                                e.preventDefault();
                                p.amountEditEscapeRef.current = true;
                                p.setAmountEditingId(null);
                                p.setAmountDraft('');
                            }
                        }}
                        disabled={p.amountUpdatingId === row.id || p.inlinePatchUpdatingId === row.id}
                        autoFocus
                        slotProps={{
                            htmlInput: {
                                inputMode: 'decimal',
                                'aria-label': t('accountancy.amountColumn'),
                            },
                        }}
                        sx={{
                            width: 76,
                            '& .MuiInputBase-input': {
                                fontSize: '0.6875rem',
                                py: '3px',
                            },
                        }}
                    />
                ) : (
                    <Tooltip title={t('accountancy.inlineAmountEditHint')}>
                        <Box
                            component="span"
                            onClick={() => {
                                if (p.amountUpdatingId === row.id || p.inlinePatchUpdatingId === row.id) return;
                                p.setAmountEditingId(row.id);
                                p.setAmountDraft(
                                    Math.abs(row.amount).toLocaleString('ru-RU', {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                    }),
                                );
                            }}
                            sx={{
                                cursor: p.amountUpdatingId === row.id ? 'default' : 'pointer',
                                display: 'inline-block',
                            }}
                        >
                            {row.amount >= 0 ? '+' : ''}
                            {p.formatAmount(row.amount)}
                        </Box>
                    </Tooltip>
                )}
            </TableCell>
            <TableCell sx={{ px: 0.25, verticalAlign: 'middle' }}>
                <SourceRecipientSelect
                    value={(row.source ?? '') as SourceRecipientOptionValue}
                    onChange={(v) => void p.handleSourceChange(row, v)}
                    label={t('accountancy.source')}
                    counterparties={p.counterparties}
                    usersWithCashflow={p.usersWithCashflow}
                    prefetchedOptions={p.sourceRecipientOptions}
                    hideLabel
                    popperMinWidth={240}
                    disabled={
                        p.inlinePatchUpdatingId === row.id ||
                        p.quantityUpdatingId === row.id ||
                        p.reportMonthUpdatingId === row.id ||
                        p.statusUpdatingId === row.id
                    }
                    sx={p.opTableSourceRecipientSx}
                />
            </TableCell>
            <TableCell sx={{ px: 0.25, verticalAlign: 'middle' }}>
                <SourceRecipientSelect
                    value={(row.recipient ?? '') as SourceRecipientOptionValue}
                    onChange={(v) => void p.handleRecipientChange(row, v)}
                    label={t('accountancy.recipient')}
                    counterparties={p.counterparties}
                    usersWithCashflow={p.usersWithCashflow}
                    cashflows={p.cashflows}
                    includeCashflows
                    prefetchedOptions={p.recipientRecipientOptions}
                    hideLabel
                    popperMinWidth={240}
                    disabled={
                        p.inlinePatchUpdatingId === row.id ||
                        p.quantityUpdatingId === row.id ||
                        p.reportMonthUpdatingId === row.id ||
                        p.statusUpdatingId === row.id
                    }
                    sx={p.opTableSourceRecipientSx}
                />
            </TableCell>
            <TableCell sx={{ px: 0.25 }}>
                <Stack direction="row" alignItems="center" spacing={0}>
                    <Link
                        href={
                            row.type === 'expense'
                                ? `/dashboard/accountancy/expense/edit/${row.entityId}`
                                : `/dashboard/accountancy/income/edit/${row.entityId}`
                        }
                        aria-label={t('common.view')}
                        style={{ display: 'inline-flex' }}
                    >
                        <IconButton size="small" color="primary" component="span">
                            <Visibility fontSize="small" />
                        </IconButton>
                    </Link>
                    <Tooltip
                        title={
                            row.type === 'expense'
                                ? t('accountancy.deleteExpenseTitle')
                                : t('accountancy.deleteIncomeTitle')
                        }
                    >
                        <span>
                            <IconButton
                                size="small"
                                color="error"
                                onClick={() => p.handleOperationDeleteClick(row)}
                                disabled={p.operationDeletingId === row.id}
                                aria-label={t('common.delete')}
                            >
                                <DeleteIcon fontSize="small" />
                            </IconButton>
                        </span>
                    </Tooltip>
                </Stack>
            </TableCell>
        </TableRow>
    );
}

export const AccountancyOverviewOperationTableRow = memo(AccountancyOverviewOperationTableRowInner);
