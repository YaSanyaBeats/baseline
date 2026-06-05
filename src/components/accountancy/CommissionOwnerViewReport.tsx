'use client';

import { Fragment } from 'react';
import {
    Accordion,
    AccordionDetails,
    AccordionSummary,
    Alert,
    Box,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {
    type CommissionOwnerViewExpenseGroup,
    type CommissionOwnerViewIncomeGroup,
    type CommissionOwnerViewRoomSection,
    type CommissionOwnerViewStoredPayload,
} from '@/lib/commissionOwnerView';
import {
    sumOwnerViewExpenseColumnSigned,
    sumOwnerViewExpenseTableSignedTotal,
    ownerViewExpenseColumnValue,
    type CommissionOwnerViewExpenseLine,
} from '@/lib/ownerViewExpenses';
import { sumOwnerViewIncomeTableTotal } from '@/lib/ownerViewIncomes';

function formatAmount(value: number, locale: string): string {
    return value.toLocaleString(locale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function getExpenseColumnSignedValue(row: CommissionOwnerViewExpenseLine): number | null {
    return ownerViewExpenseColumnValue(row, 'expense');
}

function formatSignedAmount(value: number, locale: string): string {
    const sign = value >= 0 ? '+' : '−';
    return `${sign}${formatAmount(Math.abs(value), locale)}`;
}

function signedAmountColor(value: number): 'success.main' | 'error.main' {
    return value >= 0 ? 'success.main' : 'error.main';
}

function SignedAmountValue({ value, locale }: { value: number | null; locale: string }) {
    if (value == null) {
        return (
            <Typography component="span" color="text.secondary">
                —
            </Typography>
        );
    }
    return (
        <Typography component="span" sx={{ color: signedAmountColor(value), fontWeight: 500 }}>
            {formatSignedAmount(value, locale)}
        </Typography>
    );
}

function ExpenseColumnValue({
    row,
    locale,
}: {
    row: CommissionOwnerViewExpenseLine;
    locale: string;
}) {
    const signed = getExpenseColumnSignedValue(row);
    if (signed == null) {
        return (
            <Typography component="span" color="text.secondary">
                —
            </Typography>
        );
    }
    return (
        <Typography component="span" sx={{ color: signedAmountColor(signed), fontWeight: 500 }}>
            {formatSignedAmount(signed, locale)}
        </Typography>
    );
}

function formatDateShort(iso: string, locale: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function filterExpenseGroupsForDisplay(
    groups: CommissionOwnerViewExpenseGroup[]
): CommissionOwnerViewExpenseGroup[] {
    return groups
        .map((group) => ({
            ...group,
            lines: group.lines.filter((line) => !line.isIncome),
        }))
        .filter((group) => group.lines.length > 0);
}

type HeadCellSx = (bg: string, color?: string) => Record<string, unknown>;

function RoomIncomesTable({
    section,
    locale,
    t,
    headCellSx,
}: {
    section: CommissionOwnerViewRoomSection;
    locale: string;
    t: (key: string) => string;
    headCellSx: HeadCellSx;
}) {
    const incomeGroups = section.incomeGroups;
    const incomeTotal = sumOwnerViewIncomeTableTotal(incomeGroups);
    const hasRows = incomeGroups.some((g) => g.lines.length > 0);

    const groupLabel = (group: CommissionOwnerViewIncomeGroup) =>
        group.kind === 'booking' ? group.label : t(group.labelI18nKey ?? '');

    return (
        <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
            <Typography variant="subtitle1" sx={{ ...headCellSx('success.main'), px: 2, py: 1 }}>
                {t('accountancy.commission.ownerTableIncomes')}
            </Typography>
            <TableContainer sx={{ maxWidth: '100%', overflowX: 'auto' }}>
                <Table size="small" stickyHeader>
                    <TableHead>
                        <TableRow>
                            <TableCell sx={headCellSx('success.dark')}>
                                {t('accountancy.commission.ownerColDescription')}
                            </TableCell>
                            <TableCell sx={headCellSx('success.dark')} align="right">
                                {t('accountancy.quantity')}
                            </TableCell>
                            <TableCell sx={headCellSx('success.dark')} align="right">
                                {t('accountancy.commission.ownerColPriceThb')}
                            </TableCell>
                            <TableCell sx={headCellSx('success.dark')} align="right">
                                {t('accountancy.commission.ownerColSumThb')}
                            </TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {!hasRows ? (
                            <TableRow>
                                <TableCell colSpan={4}>
                                    <Typography variant="body2" color="text.secondary">
                                        {t('accountancy.commission.noIncomes')}
                                    </Typography>
                                </TableCell>
                            </TableRow>
                        ) : (
                            incomeGroups.map((group) => (
                                <Fragment key={group.key}>
                                    <TableRow sx={{ bgcolor: 'action.selected' }}>
                                        <TableCell colSpan={4} sx={{ fontWeight: 700 }}>
                                            {groupLabel(group)}
                                        </TableCell>
                                    </TableRow>
                                    {group.lines.map((row) => (
                                        <TableRow key={row.key}>
                                            <TableCell>{row.description}</TableCell>
                                            <TableCell align="right">{row.quantity}</TableCell>
                                            <TableCell align="right">
                                                {formatAmount(row.unitPrice, locale)}
                                            </TableCell>
                                            <TableCell align="right">
                                                {formatAmount(row.lineTotal, locale)}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </Fragment>
                            ))
                        )}
                        {hasRows && (
                            <TableRow sx={{ bgcolor: 'action.hover' }}>
                                <TableCell colSpan={3} align="right" sx={{ fontWeight: 700 }}>
                                    {t('accountancy.commission.ownerTotalIncomes')}
                                </TableCell>
                                <TableCell align="right" sx={{ fontWeight: 700 }}>
                                    {formatAmount(incomeTotal, locale)}
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>
        </Paper>
    );
}

function RoomExpensesTable({
    section,
    locale,
    t,
    headCellSx,
}: {
    section: CommissionOwnerViewRoomSection;
    locale: string;
    t: (key: string) => string;
    headCellSx: HeadCellSx;
}) {
    const expenseGroups = filterExpenseGroupsForDisplay(section.expenseGroups);
    const expenseColumnTotal = sumOwnerViewExpenseTableSignedTotal(expenseGroups);
    const agencyExpenseColumnTotal = sumOwnerViewExpenseColumnSigned(expenseGroups, 'agency');
    const hasRows = expenseGroups.length > 0;

    const groupLabel = (group: CommissionOwnerViewExpenseGroup) =>
        group.kind === 'booking' ? group.label : t(group.labelI18nKey ?? '');

    return (
        <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
            <Typography variant="subtitle1" sx={{ ...headCellSx('warning.dark'), px: 2, py: 1 }}>
                {t('accountancy.commission.ownerTableExpenses')}
            </Typography>
            <TableContainer sx={{ maxWidth: '100%', overflowX: 'auto' }}>
                <Table size="small" stickyHeader>
                    <TableHead>
                        <TableRow>
                            <TableCell sx={headCellSx('warning.main', 'common.black')}>
                                {t('accountancy.commission.ownerColDescription')}
                            </TableCell>
                            <TableCell sx={headCellSx('warning.main', 'common.black')} align="right">
                                {t('accountancy.quantity')}
                            </TableCell>
                            <TableCell sx={headCellSx('warning.main', 'common.black')} align="right">
                                {t('accountancy.commission.ownerColPriceThb')}
                            </TableCell>
                            <TableCell sx={headCellSx('warning.main', 'common.black')} align="right">
                                {t('accountancy.commission.ownerColSumThb')}
                            </TableCell>
                            <TableCell sx={headCellSx('warning.main', 'common.black')} align="right">
                                {t('accountancy.commission.ownerColExpenseThb')}
                            </TableCell>
                            <TableCell sx={headCellSx('warning.main', 'common.black')} align="right">
                                {t('accountancy.commission.ownerColAgencyExpenses')}
                            </TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {!hasRows ? (
                            <TableRow>
                                <TableCell colSpan={6}>
                                    <Typography variant="body2" color="text.secondary">
                                        {t('accountancy.noExpenses')}
                                    </Typography>
                                </TableCell>
                            </TableRow>
                        ) : (
                            expenseGroups.map((group) => (
                                <Fragment key={group.key}>
                                    <TableRow sx={{ bgcolor: 'action.selected' }}>
                                        <TableCell colSpan={6} sx={{ fontWeight: 700 }}>
                                            {groupLabel(group)}
                                        </TableCell>
                                    </TableRow>
                                    {group.lines.map((row) => (
                                        <TableRow
                                            key={row.key}
                                            sx={row.isAgency ? { bgcolor: 'warning.50' } : undefined}
                                        >
                                            <TableCell>{row.description}</TableCell>
                                            <TableCell align="right">{row.quantity}</TableCell>
                                            <TableCell align="right">{formatAmount(row.unitPrice, locale)}</TableCell>
                                            <TableCell align="right">{formatAmount(row.lineTotal, locale)}</TableCell>
                                            <TableCell align="right">
                                                <ExpenseColumnValue row={row} locale={locale} />
                                            </TableCell>
                                            <TableCell align="right">
                                                <SignedAmountValue
                                                    value={ownerViewExpenseColumnValue(row, 'agency')}
                                                    locale={locale}
                                                />
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </Fragment>
                            ))
                        )}
                        {hasRows && (
                            <TableRow sx={{ bgcolor: 'action.hover' }}>
                                <TableCell colSpan={4} align="right" sx={{ fontWeight: 700 }}>
                                    {t('accountancy.commission.ownerTotalExpenses')}
                                </TableCell>
                                <TableCell
                                    align="right"
                                    sx={{
                                        fontWeight: 700,
                                        color: signedAmountColor(expenseColumnTotal),
                                    }}
                                >
                                    {formatSignedAmount(expenseColumnTotal, locale)}
                                </TableCell>
                                <TableCell align="right" sx={{ fontWeight: 700 }}>
                                    <Typography
                                        component="span"
                                        sx={{ color: signedAmountColor(agencyExpenseColumnTotal), fontWeight: 700 }}
                                    >
                                        {formatSignedAmount(agencyExpenseColumnTotal, locale)}
                                    </Typography>
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>
        </Paper>
    );
}

function RoomEarningsTable({
    section,
    locale,
    t,
    headCellSx,
}: {
    section: CommissionOwnerViewRoomSection;
    locale: string;
    t: (key: string) => string;
    headCellSx: HeadCellSx;
}) {
    const expenseColumnTotal = sumOwnerViewExpenseTableSignedTotal(
        filterExpenseGroupsForDisplay(section.expenseGroups)
    );
    const earningsNet = section.totals.totalIncome + expenseColumnTotal;

    return (
        <Paper variant="outlined" sx={{ overflow: 'hidden', maxWidth: 480 }}>
            <Typography variant="subtitle1" sx={{ ...headCellSx('info.dark'), px: 2, py: 1 }}>
                {t('accountancy.commission.ownerTableEarnings')}
            </Typography>
            <Table size="small">
                <TableBody>
                    <TableRow>
                        <TableCell sx={{ fontWeight: 600 }}>
                            {t('accountancy.commission.ownerEarningsRowIncomes')}
                        </TableCell>
                        <TableCell align="right">{formatAmount(section.totals.totalIncome, locale)}</TableCell>
                    </TableRow>
                    <TableRow>
                        <TableCell sx={{ fontWeight: 600 }}>
                            {t('accountancy.commission.ownerEarningsRowExpenses')}
                        </TableCell>
                        <TableCell align="right">
                            {formatAmount(-expenseColumnTotal, locale)}
                        </TableCell>
                    </TableRow>
                    <TableRow sx={{ bgcolor: 'action.hover' }}>
                        <TableCell sx={{ fontWeight: 700 }}>
                            {t('accountancy.commission.ownerEarningsRowTotal')}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>
                            {formatAmount(earningsNet, locale)}
                        </TableCell>
                    </TableRow>
                </TableBody>
            </Table>
        </Paper>
    );
}

export type CommissionOwnerViewReportProps = {
    payload: CommissionOwnerViewStoredPayload;
    displayLocale: string;
    t: (key: string) => string;
    title?: string;
};

export default function CommissionOwnerViewReport({
    payload,
    displayLocale,
    t,
    title,
}: CommissionOwnerViewReportProps) {
    const headCellSx: HeadCellSx = (bg, color) => ({
        bgcolor: bg,
        color: color ?? 'common.white',
        fontWeight: 700,
        whiteSpace: 'nowrap',
    });

    return (
        <Box>
            <Typography variant="h4" sx={{ mb: 1 }}>
                {title ?? t('accountancy.commission.ownerViewTitle')}
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
                {payload.reportTitle} · {payload.monthKey}
            </Typography>

            <Stack spacing={3}>
                <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
                    <Typography
                        variant="subtitle1"
                        sx={{ ...headCellSx('warning.light', 'common.black'), px: 2, py: 1 }}
                    >
                        {t('accountancy.commission.ownerTableSettlements')}
                    </Typography>
                    <TableContainer>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ fontWeight: 700 }}>{t('accountancy.dateColumn')}</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>
                                        {t('accountancy.commission.ownerColReason')}
                                    </TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                                        {t('accountancy.commission.ownerColAmountThb')}
                                    </TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                                        {t('accountancy.commission.ownerColBalance')}
                                    </TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {payload.settlementRows.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={4}>
                                            <Typography variant="body2" color="text.secondary">
                                                {t('accountancy.commission.ownerNoSettlements')}
                                            </Typography>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    payload.settlementRows.map((row) => (
                                        <TableRow key={row.key}>
                                            <TableCell>
                                                {formatDateShort(
                                                    row.date.includes('T') ? row.date : `${row.date}T12:00:00`,
                                                    displayLocale
                                                )}
                                            </TableCell>
                                            <TableCell>{row.description}</TableCell>
                                            <TableCell align="right">
                                                {formatAmount(row.amount, displayLocale)}
                                            </TableCell>
                                            <TableCell align="right">
                                                {formatAmount(row.balance, displayLocale)}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Paper>

                {payload.roomSections.length === 0 ? (
                    <Alert severity="info">{t('accountancy.commission.noBookings')}</Alert>
                ) : (
                    payload.roomSections.map((section, index) => (
                        <Accordion
                            key={section.key}
                            defaultExpanded={index === 0}
                            elevation={0}
                            variant="outlined"
                            sx={{ '&:before': { display: 'none' } }}
                        >
                            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                                <Typography fontWeight={700}>{section.title}</Typography>
                            </AccordionSummary>
                            <AccordionDetails>
                                <Stack spacing={3}>
                                    <RoomIncomesTable
                                        section={section}
                                        locale={displayLocale}
                                        t={t}
                                        headCellSx={headCellSx}
                                    />
                                    <RoomExpensesTable
                                        section={section}
                                        locale={displayLocale}
                                        t={t}
                                        headCellSx={headCellSx}
                                    />
                                    <RoomEarningsTable
                                        section={section}
                                        locale={displayLocale}
                                        t={t}
                                        headCellSx={headCellSx}
                                    />
                                </Stack>
                            </AccordionDetails>
                        </Accordion>
                    ))
                )}
            </Stack>
        </Box>
    );
}
