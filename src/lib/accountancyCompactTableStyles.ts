import { alpha } from '@mui/material/styles';
import type { Theme } from '@mui/material/styles';

export const COMPACT_COL_DEL = 32;
export const COMPACT_COL_ROOM = 168;
export const COMPACT_COL_BOOKING = 108;
export const COMPACT_COL_CAT = 148;
export const COMPACT_COL_PARTY = 152;
export const COMPACT_COL_COMMENT = 112;
export const COMPACT_COL_AMOUNT = 72;
export const COMPACT_COL_QTY = 52;
export const COMPACT_COL_SUM = 76;
export const COMPACT_COL_DATE = 118;
export const COMPACT_COL_STATUS = 84;
export const COMPACT_COL_SUB_TX = 44;
export const COMPACT_COL_DIVISIBILITY = 44;
export const COMPACT_COL_ATTACH = 40;

export function bulkAddTableColCount(transactionType: 'expense' | 'income'): number {
    return transactionType === 'expense' ? 15 : 14;
}

export function txnAddTableColCount(params: {
    type: 'expense' | 'income';
    isSubtransactionMode: boolean;
}): number {
    const { type, isSubtransactionMode } = params;
    if (isSubtransactionMode) {
        return 12;
    }
    return type === 'expense' ? 14 : 12;
}

export const BULK_ADD_TABLE_MIN_WIDTH_PX =
    COMPACT_COL_DEL +
    COMPACT_COL_ROOM +
    COMPACT_COL_BOOKING +
    COMPACT_COL_CAT +
    COMPACT_COL_PARTY * 2 +
    COMPACT_COL_COMMENT +
    COMPACT_COL_AMOUNT +
    COMPACT_COL_QTY +
    COMPACT_COL_SUM +
    COMPACT_COL_DATE +
    COMPACT_COL_STATUS +
    COMPACT_COL_SUB_TX +
    COMPACT_COL_DIVISIBILITY +
    COMPACT_COL_ATTACH;

export const TXN_ADD_TABLE_MIN_WIDTH_PX =
    COMPACT_COL_DEL +
    COMPACT_COL_BOOKING +
    COMPACT_COL_CAT +
    COMPACT_COL_PARTY * 2 +
    COMPACT_COL_AMOUNT +
    COMPACT_COL_QTY +
    COMPACT_COL_SUM +
    COMPACT_COL_DATE +
    COMPACT_COL_COMMENT +
    COMPACT_COL_STATUS +
    COMPACT_COL_SUB_TX +
    COMPACT_COL_DIVISIBILITY +
    COMPACT_COL_ATTACH;

export function formatCompactLineTotal(quantity: number | undefined, unitCost: number): string {
    return ((quantity ?? 1) * unitCost).toLocaleString('ru-RU', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

export const compactTableSx = {
    tableLayout: 'fixed',
    width: '100%',
    fontSize: '0.6875rem',
    borderCollapse: 'collapse',
    '& .MuiTableCell-root': {
        py: 0.35,
        px: 0.4,
        verticalAlign: 'top',
        lineHeight: 1.2,
        borderRight: '1px solid',
        borderColor: 'divider',
    },
    '& .MuiTableCell-head': {
        py: 0.35,
        px: 0.4,
        fontSize: '0.65rem',
        fontWeight: 600,
        lineHeight: 1.1,
        whiteSpace: 'nowrap',
        backgroundColor: 'action.hover',
        borderBottom: '1px solid',
        borderColor: 'divider',
    },
    '& .MuiIconButton-root': { p: 0.2 },
    '& .MuiCheckbox-root': { p: 0.25 },
} as const;

export const compactInlineSelectSx = {
    width: '100%',
    maxWidth: '100%',
    bgcolor: 'transparent',
    boxShadow: 'none',
    '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
    '&:hover .MuiOutlinedInput-notchedOutline': { border: 'none' },
    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { border: '1px solid', borderColor: 'primary.main' },
    '& .MuiSelect-icon': { fontSize: '1rem', right: 0 },
    '& .MuiSelect-select': {
        overflow: 'visible',
        textOverflow: 'clip',
        whiteSpace: 'normal',
        wordBreak: 'break-word',
        display: 'block',
        py: '2px',
        pl: 0.25,
        pr: '18px !important',
        fontSize: '0.6875rem',
        lineHeight: 1.25,
        minHeight: 22,
        height: 'auto !important',
        boxSizing: 'border-box',
    },
} as const;

export const compactSourceRecipientSx = {
    width: '100%',
    minWidth: 0,
    maxWidth: '100%',
    '& .MuiOutlinedInput-root': {
        minHeight: 'auto',
        height: 'auto',
        alignItems: 'flex-start',
        fontSize: '0.6875rem',
        py: 0,
        px: 0.25,
        boxSizing: 'border-box',
        bgcolor: 'transparent',
        '& fieldset': { border: 'none' },
        '&:hover fieldset': { border: 'none' },
        '&.Mui-focused fieldset': { border: '1px solid', borderColor: 'primary.main' },
        '&.Mui-focused': { boxShadow: 'none' },
    },
    '& .MuiOutlinedInput-input': {
        py: '2px',
        px: 0,
        fontSize: '0.6875rem',
        cursor: 'pointer',
        whiteSpace: 'normal',
        wordBreak: 'break-word',
        overflow: 'visible',
        textOverflow: 'clip',
    },
    '& .MuiAutocomplete-popupIndicator': { display: 'none' },
    '& .MuiAutocomplete-clearIndicator': { display: 'none' },
} as const;

export const compactRoomSelectSx = {
    width: '100%',
    minWidth: 0,
    maxWidth: '100%',
    '& .MuiOutlinedInput-root': {
        minHeight: 'auto',
        fontSize: '0.6875rem',
        py: 0,
        px: 0.25,
        '& fieldset': { border: 'none' },
        '&:hover fieldset': { border: 'none' },
        '&.Mui-focused fieldset': { border: '1px solid', borderColor: 'primary.main' },
    },
    '& .MuiOutlinedInput-input': {
        py: '2px',
        fontSize: '0.6875rem',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
    },
    '& .MuiAutocomplete-popupIndicator': { fontSize: '1rem', mr: -0.25 },
} as const;

export const compactBookingLabelSx = {
    fontSize: '0.65rem',
    flex: 1,
    minWidth: 0,
    whiteSpace: 'normal',
    wordBreak: 'break-word',
    lineHeight: 1.25,
} as const;

export const compactCellTextFieldSx = {
    width: '100%',
    '& .MuiOutlinedInput-root': {
        minHeight: 'auto',
        fontSize: '0.6875rem',
        py: 0,
        px: 0.25,
        '& fieldset': { border: 'none' },
        '&:hover fieldset': { border: 'none' },
        '&.Mui-focused fieldset': { border: '1px solid', borderColor: 'primary.main' },
    },
    '& .MuiOutlinedInput-input': {
        py: '2px',
        px: 0.25,
        fontSize: '0.6875rem',
    },
} as const;

const GROUP_BORDER_W = 2;

function groupTopBorder(theme: Theme) {
    return `${GROUP_BORDER_W}px solid ${theme.palette.primary.main}`;
}

function groupBottomBorder(theme: Theme) {
    return `${GROUP_BORDER_W}px solid ${theme.palette.primary.main}`;
}

function groupSideCellSx(theme: Theme, side: 'left' | 'right') {
    const border = `${GROUP_BORDER_W}px solid ${theme.palette.primary.main}`;
    return side === 'left' ? { borderLeft: border } : { borderRight: border };
}

export const compactGroupParentRowSx = (theme: Theme) => ({
    '& .MuiTableCell-root': {
        borderTop: groupTopBorder(theme),
    },
    '& .MuiTableCell-root:first-of-type': groupSideCellSx(theme, 'left'),
    '& .MuiTableCell-root:last-of-type': groupSideCellSx(theme, 'right'),
});

export const compactGroupSubHeaderRowSx = (closesGroup: boolean) => (theme: Theme) => ({
    '& .MuiTableCell-root': {
        borderTop: `1px dashed ${alpha(theme.palette.primary.main, 0.5)}`,
        borderBottom: closesGroup ? groupBottomBorder(theme) : 'none',
        ...groupSideCellSx(theme, 'left'),
        ...groupSideCellSx(theme, 'right'),
    },
});

export const compactGroupSubRowSx = (isLast: boolean) => (theme: Theme) => ({
    '& .MuiTableCell-root': {
        ...(isLast ? { borderBottom: groupBottomBorder(theme) } : {}),
    },
    '& .MuiTableCell-root:first-of-type': groupSideCellSx(theme, 'left'),
    '& .MuiTableCell-root:last-of-type': groupSideCellSx(theme, 'right'),
});
