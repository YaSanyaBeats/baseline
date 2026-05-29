'use client';

import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { memo } from 'react';
import {
    Box,
    Checkbox,
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
    Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
    Check as CheckIcon,
    Close as CloseIcon,
    Delete as DeleteIcon,
    SubdirectoryArrowRight as SubdirectoryArrowRightIcon,
    Visibility,
} from '@mui/icons-material';
import Link from 'next/link';
import type { BookingCommissionResult, ManagementCommissionPercent } from '@/lib/commissionCalculation';
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
    /** ID категории из справочника */
    categoryId?: string;
    /** Отображаемое название (из справочника по categoryId) */
    category: string;
    comment: string;
    quantity: number;
    amount: number;
    reportMonth: string;
    source?: string;
    recipient?: string;
    autoCreated?: boolean;
    /** Подпись брони-источника для Tooltip badge «Авто» */
    autoCreatedBookingLabel?: string;
    bookingId?: number;
    /** Учитывать в расчёте синтетических транзакций (только расходы в группах броней) */
    includeInSynthetic?: boolean;
    /** Процент комиссии для транзакций без брони с включённой делимостью. */
    commissionPercent?: 15 | 20 | 25 | 30;
    /** Сводка accountancy: авто-комиссия по схеме комнаты, без записи в БД */
    readOnlySynthetic?: boolean;
    /** Черновик новой транзакции в сводке (ещё не сохранён в БД) */
    isPendingDraft?: boolean;
    /** Детализация расчёта для Tooltip (только при readOnlySynthetic) */
    syntheticCommissionDetail?: BookingCommissionResult;
    syntheticCommissionPercent?: ManagementCommissionPercent;
    syntheticCommissionPercentOverridden?: boolean;
    syntheticPercentKey?: string;
    syntheticPercentUpdatingKey?: string;
    /** Родительская транзакция, если строка — подтранзакция */
    parentTransaction?: {
        id: string;
        type: 'expense' | 'income';
        label: string;
    };
    /** Комната для фильтра сводки (стабильная метка) */
    resolvedRoomKey?: string | null;
    /** Закрытый отчётный период — предрасчёт на странице сводки */
    periodLocked?: boolean;
};

export type AccountancyOverviewOperationTableRowProps = {
    row: AccountancyOverviewOperationRowModel;
    /** Показать чекбокс «Делимость» (брони — расходы; «Общие расходы» без брони — расходы и приходы) */
    showDivisibilityCheckbox?: boolean;
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
    commissionPercentUpdatingBookingId: number | null;
    handleSyntheticCommissionPercentChange: (
        row: AccountancyOverviewOperationRowModel,
        percent: ManagementCommissionPercent,
    ) => void | Promise<void>;
    pendingDraftSavingId: string | null;
    onPendingDraftSave: (row: AccountancyOverviewOperationRowModel) => void | Promise<void>;
    onPendingDraftCancel: (row: AccountancyOverviewOperationRowModel) => void;
    includeInSyntheticUpdatingId: string | null;
    handleIncludeInSyntheticChange: (
        row: AccountancyOverviewOperationRowModel,
        included: boolean,
    ) => void | Promise<void>;
    commissionPercentUpdatingId: string | null;
    shouldShowCommissionPercentSelect: (row: AccountancyOverviewOperationRowModel) => boolean;
    handleCommissionPercentChange: (
        row: AccountancyOverviewOperationRowModel,
        percent: 15 | 20 | 25 | 30,
    ) => void | Promise<void>;
    /** Отчётный период транзакции зафиксирован — только просмотр */
    periodLocked?: boolean;
};

const COMMISSION_TOOLTIP_LINE_CAP = 14;

function SyntheticCommissionTooltipBody({
    detail,
    formatAmount,
    t,
}: {
    detail: BookingCommissionResult;
    formatAmount: (n: number) => string;
    t: (key: string) => string;
}) {
    const fmt = (n: number) => formatAmount(n);
    const schemeLine = t('accountancy.syntheticCommissionScheme').replace('{{scheme}}', String(detail.schemeId));
    const totalLine = t('accountancy.syntheticCommissionTotal').replace('{{amount}}', fmt(detail.commission));

    return (
        <Box
            sx={{
                color: 'inherit',
                maxWidth: 400,
                maxHeight: 380,
                overflow: 'auto',
                py: 0.5,
                pr: 0.25,
            }}
        >
            <Typography variant="caption" component="div" sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}>
                {t('accountancy.syntheticCommissionTooltipTitle')}
            </Typography>
            <Typography variant="caption" component="div" sx={{ opacity: 0.88, display: 'block', mb: 1 }}>
                {schemeLine}
            </Typography>
            <Stack spacing={1.1}>
                {detail.steps.map((step, idx) => (
                    <Box key={idx}>
                        <Typography variant="caption" component="div" sx={{ fontWeight: 600, display: 'block' }}>
                            {step.description}
                            {typeof step.value === 'number' && !Number.isNaN(step.value)
                                ? `: ${fmt(step.value)}`
                                : ''}
                        </Typography>
                        {step.formula ? (
                            <Typography variant="caption" component="div" sx={{ opacity: 0.9, pl: 0.5, display: 'block' }}>
                                {step.formula}
                            </Typography>
                        ) : null}
                        {step.nightBooking ? (
                            <Typography variant="caption" component="div" sx={{ opacity: 0.85, display: 'block' }}>
                                {new Date(step.nightBooking.arrival).toLocaleDateString('ru-RU', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    year: '2-digit',
                                })}{' '}
                                —{' '}
                                {new Date(step.nightBooking.departure).toLocaleDateString('ru-RU', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    year: '2-digit',
                                })}
                            </Typography>
                        ) : null}
                        {step.lineItems && step.lineItems.length > 0 ? (
                            <Box component="ul" sx={{ m: 0, pl: 2, mt: 0.35, opacity: 0.88 }}>
                                {step.lineItems.slice(0, COMMISSION_TOOLTIP_LINE_CAP).map((li, i) => {
                                    const d = new Date(li.date);
                                    const ds = Number.isNaN(d.getTime())
                                        ? '—'
                                        : d.toLocaleDateString('ru-RU', {
                                              day: '2-digit',
                                              month: '2-digit',
                                              year: '2-digit',
                                          });
                                    return (
                                        <Typography key={i} component="li" variant="caption" sx={{ display: 'list-item' }}>
                                            {ds} · {li.kind === 'income' ? '+' : '−'}
                                            {fmt(Math.abs(li.amount))} · {li.category}
                                        </Typography>
                                    );
                                })}
                                {step.lineItems.length > COMMISSION_TOOLTIP_LINE_CAP ? (
                                    <Typography variant="caption" component="div" sx={{ mt: 0.25, opacity: 0.75 }}>
                                        {t('accountancy.syntheticCommissionMoreLines').replace(
                                            '{{n}}',
                                            String(step.lineItems.length - COMMISSION_TOOLTIP_LINE_CAP),
                                        )}
                                    </Typography>
                                ) : null}
                            </Box>
                        ) : null}
                    </Box>
                ))}
            </Stack>
            <Typography variant="caption" component="div" sx={{ mt: 1.25, fontWeight: 700, display: 'block' }}>
                {totalLine}
            </Typography>
        </Box>
    );
}

function AccountancyOverviewOperationTableRowInner(p: AccountancyOverviewOperationTableRowProps) {
    const { row, t, periodLocked = false } = p;
    const ro = row.readOnlySynthetic === true || periodLocked;
    const pending = row.isPendingDraft === true;
    const isSubtransaction = Boolean(row.parentTransaction);
    const parentHref =
        row.parentTransaction != null
            ? row.parentTransaction.type === 'expense'
                ? `/dashboard/accountancy/expense/edit/${row.parentTransaction.id}`
                : `/dashboard/accountancy/income/edit/${row.parentTransaction.id}`
            : null;
    const addSubtransactionHref =
        row.type === 'expense'
            ? `/dashboard/accountancy/income/add?parentExpenseId=${encodeURIComponent(row.entityId)}`
            : `/dashboard/accountancy/expense/add?parentIncomeId=${encodeURIComponent(row.entityId)}`;
    const showAddSubtransactionButton = !ro && !pending && !isSubtransaction;
    return (
        <TableRow
            sx={
                pending
                    ? {
                          bgcolor: (theme) =>
                              alpha(
                                  theme.palette.warning.main,
                                  theme.palette.mode === 'light' ? 0.08 : 0.14,
                              ),
                      }
                    : ro
                    ? {
                          bgcolor: (theme) =>
                              alpha(
                                  theme.palette.info.main,
                                  theme.palette.mode === 'light' ? 0.07 : 0.12,
                              ),
                      }
                    : isSubtransaction
                      ? {
                            bgcolor: (theme) =>
                                alpha(
                                    theme.palette.secondary.main,
                                    theme.palette.mode === 'light' ? 0.06 : 0.12,
                                ),
                            boxShadow: (theme) => `inset 3px 0 0 ${theme.palette.secondary.main}`,
                        }
                    : row.autoCreated
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
                        disabled={
                            ro || p.statusUpdatingId === row.id || p.inlinePatchUpdatingId === row.id
                        }
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
                        disabled={
                            ro ||
                            p.reportMonthUpdatingId === row.id ||
                            p.inlinePatchUpdatingId === row.id
                        }
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
                <Stack spacing={0.25}>
                    <Box component="span">
                        {row.date
                            ? new Date(row.date).toLocaleDateString('ru-RU', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: '2-digit',
                              })
                            : '—'}
                    </Box>
                    {pending ? (
                        <Typography
                            variant="caption"
                            component="span"
                            sx={{
                                display: 'block',
                                fontSize: '0.5625rem',
                                lineHeight: 1.2,
                                color: row.type === 'expense' ? 'error.main' : 'success.main',
                            }}
                        >
                            {row.type === 'expense' ? t('accountancy.expense') : t('accountancy.income')}
                        </Typography>
                    ) : null}
                </Stack>
            </TableCell>
            <TableCell sx={{ px: 0.25, overflow: 'hidden' }}>
                <Stack direction="row" alignItems="center" spacing={0.5} flexWrap="nowrap" sx={{ minWidth: 0 }}>
                    {ro ? (
                        <Typography
                            variant="body2"
                            sx={{
                                fontSize: '0.6875rem',
                                lineHeight: 1.25,
                                color: 'text.secondary',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                minWidth: 0,
                            }}
                        >
                            {row.category || t('accountancy.bookingGroupManagementCommissionAuto')}
                        </Typography>
                    ) : (
                    <FormControl size="small" sx={{ ...p.opTableCatSelectFormSx, flexShrink: 1, minWidth: 0 }}>
                        <Select
                            sx={p.opTableInlineSelectSx}
                            IconComponent={() => null}
                            value={row.categoryId || ''}
                            displayEmpty
                            onChange={(e) => void p.handleCategoryChange(row, e.target.value as string)}
                            disabled={
                                p.inlinePatchUpdatingId === row.id ||
                                p.quantityUpdatingId === row.id ||
                                p.reportMonthUpdatingId === row.id ||
                                p.statusUpdatingId === row.id
                            }
                            MenuProps={{ PaperProps: { sx: { maxHeight: 280 } } }}
                            renderValue={(selected) => {
                                if (!selected) return '—';
                                const items =
                                    row.type === 'expense' ? p.categoryItemsExpense : p.categoryItemsIncome;
                                const found = items.find((it) => it.id === selected);
                                return found?.name ?? row.category ?? selected;
                            }}
                        >
                            <MenuItem value="">
                                <em>—</em>
                            </MenuItem>
                            {(() => {
                                const items =
                                    row.type === 'expense' ? p.categoryItemsExpense : p.categoryItemsIncome;
                                const ids = new Set(items.map((it) => it.id));
                                const orphan = !!(row.categoryId && !ids.has(row.categoryId));
                                return [
                                    ...(orphan
                                        ? [
                                              <MenuItem key={`orphan-${row.id}`} value={row.categoryId}>
                                                  {row.category || row.categoryId}
                                              </MenuItem>,
                                          ]
                                        : []),
                                    ...items.map((item) => (
                                        <MenuItem key={item.id} value={item.id}>
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
                    )}
                    {!ro && row.autoCreated && (
                        <Tooltip
                            title={
                                row.autoCreatedBookingLabel
                                    ? t('accountancy.autoAccounting.autoCreatedFromBookingTooltip').replace(
                                          '{{bookingLabel}}',
                                          row.autoCreatedBookingLabel,
                                      )
                                    : t('accountancy.autoAccounting.autoCreatedBadge')
                            }
                        >
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
                {isSubtransaction && row.parentTransaction && parentHref ? (
                    <Tooltip title={row.parentTransaction.label}>
                        <Typography
                            variant="caption"
                            component={Link}
                            href={parentHref}
                            sx={{
                                display: 'block',
                                mt: 0.35,
                                fontSize: '0.5625rem',
                                lineHeight: 1.25,
                                color: 'secondary.main',
                                textDecoration: 'none',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                '&:hover': { textDecoration: 'underline' },
                            }}
                        >
                            {row.parentTransaction.label}
                        </Typography>
                    </Tooltip>
                ) : null}
            </TableCell>
            <TableCell
                sx={{
                    px: 0.25,
                    minWidth: p.OP_TABLE_COMMENT_COL_WIDTH_PX,
                    width: p.OP_TABLE_COMMENT_COL_WIDTH_PX,
                }}
            >
                {ro && row.bookingId != null ? (
                    <Stack direction="row" alignItems="center" spacing={0.75}>
                        <FormControl size="small" sx={{ width: 86 }}>
                            <Select
                                sx={p.opTableSelectSx}
                                value={row.syntheticCommissionPercent ?? ''}
                                onChange={(e) =>
                                    void p.handleSyntheticCommissionPercentChange(
                                        row,
                                        Number(e.target.value) as ManagementCommissionPercent,
                                    )
                                }
                                disabled={
                                    p.periodLocked ||
                                    p.commissionPercentUpdatingBookingId === row.bookingId
                                }
                                MenuProps={{ PaperProps: { sx: { maxHeight: 240 } } }}
                            >
                                {[30, 25, 20, 15].map((percent) => (
                                    <MenuItem key={percent} value={percent}>
                                        {percent}%
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        {row.syntheticCommissionPercentOverridden ? (
                            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.625rem' }}>
                                {t('accountancy.syntheticCommissionPercentManual')}
                            </Typography>
                        ) : null}
                    </Stack>
                ) : ro ? (
                    <Typography variant="body2" sx={{ fontSize: '0.6875rem', color: 'text.secondary' }}>
                        —
                    </Typography>
                ) : (
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
                )}
            </TableCell>
            <TableCell sx={{ px: 0.25 }}>
                {ro ? (
                    <Typography
                        variant="body2"
                        sx={{ fontSize: '0.6875rem', color: 'text.secondary', textAlign: 'center' }}
                    >
                        {row.quantity}
                    </Typography>
                ) : (
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
                )}
            </TableCell>
            <TableCell
                sx={{
                    px: 0.25,
                    color: ro ? 'text.secondary' : row.amount >= 0 ? 'success.main' : 'error.main',
                    verticalAlign: 'middle',
                    fontSize: '0.6875rem',
                }}
            >
                {p.amountEditingId === row.id && !ro ? (
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
                    <Tooltip
                        title={
                            ro && row.syntheticCommissionDetail ? (
                                <SyntheticCommissionTooltipBody
                                    detail={row.syntheticCommissionDetail}
                                    formatAmount={p.formatAmount}
                                    t={t}
                                />
                            ) : ro ? (
                                ''
                            ) : (
                                t('accountancy.inlineAmountEditHint')
                            )
                        }
                        enterDelay={ro && row.syntheticCommissionDetail ? 280 : undefined}
                        disableInteractive={!(ro && row.syntheticCommissionDetail)}
                        slotProps={
                            ro && row.syntheticCommissionDetail
                                ? {
                                      tooltip: {
                                          sx: (theme) => ({
                                              maxWidth: 420,
                                              maxHeight: 400,
                                              overflow: 'auto',
                                              ...(theme.palette.mode === 'light'
                                                  ? {
                                                        bgcolor: 'grey.900',
                                                        color: 'common.white',
                                                    }
                                                  : {
                                                        bgcolor: 'grey.200',
                                                        color: 'rgba(0, 0, 0, 0.87)',
                                                    }),
                                              border: '1px solid',
                                              borderColor: 'divider',
                                          }),
                                      },
                                  }
                                : undefined
                        }
                    >
                        <Box
                            component="span"
                            onClick={() => {
                                if (ro) return;
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
                                cursor:
                                    ro || p.amountUpdatingId === row.id ? 'default' : 'pointer',
                                display: 'inline-block',
                                ...(ro && row.syntheticCommissionDetail
                                    ? { textDecoration: 'underline dotted', textUnderlineOffset: 2 }
                                    : {}),
                            }}
                        >
                            {row.amount >= 0 ? '+' : ''}
                            {p.formatAmount(row.amount)}
                        </Box>
                    </Tooltip>
                )}
            </TableCell>
            <TableCell align="center" sx={{ px: 0.25, verticalAlign: 'middle' }}>
                {p.showDivisibilityCheckbox || p.shouldShowCommissionPercentSelect(row) ? (
                    <Stack alignItems="center" spacing={0.35} sx={{ minWidth: 0 }}>
                        {p.showDivisibilityCheckbox ? (
                            <Checkbox
                                checked={row.includeInSynthetic !== false}
                                onChange={(e) =>
                                    void p.handleIncludeInSyntheticChange(row, e.target.checked)
                                }
                                disabled={
                                    p.includeInSyntheticUpdatingId === row.id ||
                                    p.inlinePatchUpdatingId === row.id
                                }
                                size="small"
                                sx={{ p: 0.25 }}
                                inputProps={{
                                    'aria-label': t('accountancy.divisibility'),
                                }}
                            />
                        ) : null}
                        {p.shouldShowCommissionPercentSelect(row) ? (
                            <FormControl size="small" sx={{ width: 72 }}>
                                <Select
                                    sx={p.opTableSelectSx}
                                    value={row.commissionPercent ?? 30}
                                    onChange={(e) =>
                                        void p.handleCommissionPercentChange(
                                            row,
                                            Number(e.target.value) as 15 | 20 | 25 | 30,
                                        )
                                    }
                                    disabled={
                                        p.commissionPercentUpdatingId === row.id ||
                                        p.inlinePatchUpdatingId === row.id
                                    }
                                    MenuProps={{ PaperProps: { sx: { maxHeight: 220 } } }}
                                    inputProps={{
                                        'aria-label': t('accountancy.commissionRate'),
                                    }}
                                >
                                    {[30, 25, 20, 15].map((percent) => (
                                        <MenuItem key={percent} value={percent}>
                                            {percent}%
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        ) : null}
                    </Stack>
                ) : null}
            </TableCell>
            <TableCell sx={{ px: 0.25, verticalAlign: 'middle' }}>
                {ro ? (
                    <Typography variant="body2" sx={{ fontSize: '0.6875rem', color: 'text.secondary' }}>
                        —
                    </Typography>
                ) : (
                <SourceRecipientSelect
                    value={(row.source ?? '') as SourceRecipientOptionValue}
                    onChange={(v) => void p.handleSourceChange(row, v)}
                    label={t('accountancy.source')}
                    counterparties={p.counterparties}
                    usersWithCashflow={p.usersWithCashflow}
                    prefetchedOptions={p.sourceRecipientOptions}
                    hideLabel
                    popperMinWidth={220}
                    disabled={
                        p.inlinePatchUpdatingId === row.id ||
                        p.quantityUpdatingId === row.id ||
                        p.reportMonthUpdatingId === row.id ||
                        p.statusUpdatingId === row.id
                    }
                    sx={p.opTableSourceRecipientSx}
                />
                )}
            </TableCell>
            <TableCell sx={{ px: 0.25, verticalAlign: 'middle' }}>
                {ro ? (
                    <Typography variant="body2" sx={{ fontSize: '0.6875rem', color: 'text.secondary' }}>
                        —
                    </Typography>
                ) : (
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
                    popperMinWidth={220}
                    disabled={
                        p.inlinePatchUpdatingId === row.id ||
                        p.quantityUpdatingId === row.id ||
                        p.reportMonthUpdatingId === row.id ||
                        p.statusUpdatingId === row.id
                    }
                    sx={p.opTableSourceRecipientSx}
                />
                )}
            </TableCell>
            <TableCell align="right" sx={{ px: 0.25, whiteSpace: 'nowrap' }}>
                {ro ? null : pending ? (
                    <Stack direction="row" alignItems="center" justifyContent="flex-end" spacing={0}>
                        <Tooltip title={t('common.save')}>
                            <span>
                                <IconButton
                                    size="small"
                                    color="success"
                                    onClick={() => void p.onPendingDraftSave(row)}
                                    disabled={
                                        p.pendingDraftSavingId === row.id ||
                                        p.inlinePatchUpdatingId === row.id
                                    }
                                    aria-label={t('common.save')}
                                >
                                    <CheckIcon fontSize="small" />
                                </IconButton>
                            </span>
                        </Tooltip>
                        <Tooltip title={t('common.cancel')}>
                            <span>
                                <IconButton
                                    size="small"
                                    color="inherit"
                                    onClick={() => p.onPendingDraftCancel(row)}
                                    disabled={
                                        p.pendingDraftSavingId === row.id ||
                                        p.inlinePatchUpdatingId === row.id
                                    }
                                    aria-label={t('common.cancel')}
                                >
                                    <CloseIcon fontSize="small" />
                                </IconButton>
                            </span>
                        </Tooltip>
                    </Stack>
                ) : (
                <Stack direction="row" alignItems="center" justifyContent="flex-end" spacing={0}>
                    {showAddSubtransactionButton ? (
                        <Tooltip title={t('accountancy.addSubtransaction')}>
                            <Link
                                href={addSubtransactionHref}
                                aria-label={t('accountancy.addSubtransaction')}
                                style={{ display: 'inline-flex' }}
                            >
                                <IconButton size="small" color="secondary" component="span">
                                    <SubdirectoryArrowRightIcon fontSize="small" />
                                </IconButton>
                            </Link>
                        </Tooltip>
                    ) : null}
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
                )}
            </TableCell>
        </TableRow>
    );
}

export const AccountancyOverviewOperationTableRow = memo(AccountancyOverviewOperationTableRowInner);
