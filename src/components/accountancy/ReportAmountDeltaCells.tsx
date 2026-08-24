'use client';

import { Box, TableCell, TextField, Tooltip } from '@mui/material';
import { getEffectiveReportAmount } from '@/lib/accountancyUtils';

type Translate = (key: string) => string;

export function ReportAmountDeltaHeaderCells({
    t,
    compact = false,
}: {
    t: Translate;
    compact?: boolean;
}) {
    return (
        <>
            <TableCell
                align="right"
                sx={{
                    whiteSpace: 'nowrap',
                    minWidth: compact ? 128 : 148,
                    width: compact ? 128 : undefined,
                }}
            >
                {t('accountancy.reportAmountColumn')}
            </TableCell>
            <TableCell
                align="right"
                sx={{
                    whiteSpace: 'nowrap',
                    minWidth: compact ? 96 : 112,
                    width: compact ? 96 : undefined,
                }}
            >
                {t('accountancy.deltaColumn')}
            </TableCell>
        </>
    );
}

type ReportAmountDeltaBodyCellsProps = {
    signedAmount: number;
    reportAmount?: number | null;
    formatAmount: (value: number) => string;
    t: Translate;
    editable?: boolean;
    editing?: boolean;
    draft?: string;
    updating?: boolean;
    onStartEdit?: () => void;
    onDraftChange?: (value: string) => void;
    onCommit?: (raw: string) => void;
    onEscape?: () => void;
    compact?: boolean;
};

export function ReportAmountDeltaBodyCells({
    signedAmount,
    reportAmount,
    formatAmount,
    t,
    editable = false,
    editing = false,
    draft = '',
    updating = false,
    onStartEdit,
    onDraftChange,
    onCommit,
    onEscape,
    compact = false,
}: ReportAmountDeltaBodyCellsProps) {
    const reportValue = getEffectiveReportAmount(signedAmount, reportAmount);
    const delta = signedAmount - reportValue;

    return (
        <>
            <TableCell
                align="right"
                sx={{
                    color: reportValue >= 0 ? 'success.main' : 'error.main',
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                    minWidth: compact ? 128 : 148,
                    width: compact ? 128 : undefined,
                    py: editing ? (compact ? 0.25 : 0.5) : undefined,
                    fontSize: compact ? '0.6875rem' : undefined,
                }}
            >
                {editable && editing ? (
                    <TextField
                        size="small"
                        value={draft}
                        onChange={(e) => onDraftChange?.(e.target.value)}
                        onBlur={(e) => onCommit?.(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                (e.target as HTMLInputElement).blur();
                            } else if (e.key === 'Escape') {
                                e.preventDefault();
                                onEscape?.();
                            }
                        }}
                        disabled={updating}
                        autoFocus
                        slotProps={{
                            htmlInput: {
                                inputMode: 'decimal',
                                'aria-label': t('accountancy.reportAmountColumn'),
                            },
                        }}
                        sx={{
                            width: compact ? 100 : 110,
                            '& .MuiInputBase-input': {
                                fontSize: compact ? '0.6875rem' : '0.8125rem',
                                py: compact ? '3px' : '4px',
                                textAlign: 'right',
                            },
                        }}
                    />
                ) : editable ? (
                    <Tooltip title={t('accountancy.inlineReportAmountEditHint')}>
                        <Box
                            component="span"
                            onClick={() => {
                                if (updating) return;
                                onStartEdit?.();
                            }}
                            sx={{
                                cursor: updating ? 'default' : 'pointer',
                                display: 'inline-block',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {formatAmount(reportValue)}
                        </Box>
                    </Tooltip>
                ) : (
                    formatAmount(reportValue)
                )}
            </TableCell>
            <TableCell
                align="right"
                sx={{
                    color: delta === 0 ? 'text.secondary' : delta >= 0 ? 'success.main' : 'error.main',
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                    minWidth: compact ? 96 : 112,
                    width: compact ? 96 : undefined,
                    fontSize: compact ? '0.6875rem' : undefined,
                }}
            >
                {formatAmount(delta)}
            </TableCell>
        </>
    );
}
