'use client';

import {
    FormControl,
    InputLabel,
    ListSubheader,
    MenuItem,
    Select,
} from '@mui/material';
import { useObjects } from '@/providers/ObjectsProvider';
import { useTranslation } from '@/i18n/useTranslation';
import {
    PREFIX_CF,
    PREFIX_CP,
    PREFIX_ROOM,
    PREFIX_USER,
    type ParsedSourceRecipient,
    parseSourceRecipientValue,
    type SourceRecipientOptionValue,
} from '@/lib/sourceRecipientParse';

export type {
    ParsedSourceRecipient,
    SourceRecipientOptionValue,
};

export { PREFIX_CF, PREFIX_CP, PREFIX_ROOM, PREFIX_USER, parseSourceRecipientValue };

export function formatSourceRecipientLabel(
    value: SourceRecipientOptionValue | undefined,
    objects: { id: number; name: string; roomTypes: { id: number; name: string }[] }[],
    counterparties: { _id: string; name: string }[],
    usersWithCashflow?: { _id: string; name: string }[],
    cashflows?: { _id: string; name: string }[]
): string {
    const parsed = parseSourceRecipientValue(value);
    if (!parsed) return '—';
    if (parsed.type === 'room') {
        const obj = objects.find((o) => o.id === parsed.objectId);
        const room = obj?.roomTypes?.find((r) => r.id === parsed.roomId);
        if (obj && room) return `${obj.name} — ${room.name || `Room ${room.id}`}`;
        return `Object ${parsed.objectId}, Room ${parsed.roomId}`;
    }
    if (parsed.type === 'counterparty') {
        const cp = counterparties.find((c) => c._id === parsed.id);
        return cp ? cp.name : parsed.id;
    }
    
    if (parsed.type === 'user' && usersWithCashflow) {
        const idStr = String(parsed.id);
        const u = usersWithCashflow.find((x) => {
            const xId = typeof x._id === 'string' ? x._id : (x._id as { toString?: () => string })?.toString?.() ?? '';
            return xId === idStr;
        });
        return u ? u.name : parsed.id;
    }
    if (parsed.type === 'cashflow' && cashflows) {
        const cf = cashflows.find((c) => c._id === parsed.id);
        return cf ? cf.name : parsed.id;
    }
    return parsed.id || '—';
}

interface SourceRecipientSelectProps {
    value: SourceRecipientOptionValue | '';
    onChange: (value: SourceRecipientOptionValue | '') => void;
    label: string;
    counterparties: { _id: string; name: string }[];
    /** Пользователи с кешфлоу для выбора в качестве источника/получателя */
    usersWithCashflow?: { _id: string; name: string }[];
    /** Кэшфлоу для выбора в качестве получателя */
    cashflows?: { _id: string; name: string }[];
    /** Показывать кэшфлоу в списке (для поля «Кому») */
    includeCashflows?: boolean;
    size?: 'small' | 'medium';
    sx?: object;
    error?: boolean;
    disabled?: boolean;
}

export default function SourceRecipientSelect({
    value,
    onChange,
    label,
    counterparties,
    usersWithCashflow = [],
    cashflows = [],
    includeCashflows = false,
    size = 'small',
    sx,
    error,
    disabled = false,
}: SourceRecipientSelectProps) {
    const { objects } = useObjects();
    const { t } = useTranslation();

    const roomOptions: { value: SourceRecipientOptionValue; label: string }[] = [];
    objects.forEach((obj) => {
        obj.roomTypes?.forEach((room) => {
            roomOptions.push({
                value: `${PREFIX_ROOM}${obj.id}:${room.id}`,
                label: `${obj.name} — ${room.name || `Room ${room.id}`}`,
            });
        });
    });

    const cpOptions = counterparties.map((c) => ({
        value: `${PREFIX_CP}${c._id}` as SourceRecipientOptionValue,
        label: c.name,
    }));

    const userOptions = usersWithCashflow.map((u) => ({
        value: `${PREFIX_USER}${u._id}` as SourceRecipientOptionValue,
        label: u.name,
    }));

    const cfOptions = includeCashflows
        ? cashflows.map((c) => ({
              value: `${PREFIX_CF}${c._id}` as SourceRecipientOptionValue,
              label: c.name,
          }))
        : [];

    return (
        <FormControl size={size} sx={{ minWidth: 200, ...sx }} error={error} disabled={disabled}>
            <InputLabel>{label}</InputLabel>
            <Select
                value={value || ''}
                label={label}
                disabled={disabled}
                onChange={(e) => {
                    const v = e.target.value as string;
                    onChange(v === '' ? '' : (v as SourceRecipientOptionValue));
                }}
            >
                <MenuItem value="">—</MenuItem>
                {roomOptions.length > 0 && [
                    <ListSubheader key="room-header" sx={{ lineHeight: 2 }}>
                        {t('accountancy.sourceRecipientObjectsRooms')}
                    </ListSubheader>,
                    ...roomOptions.map((opt) => (
                        <MenuItem key={opt.value} value={opt.value}>
                            {opt.label}
                        </MenuItem>
                    )),
                ]}
                {cpOptions.length > 0 && [
                    <ListSubheader key="cp-header" sx={{ lineHeight: 2 }}>
                        {t('accountancy.sourceRecipientCounterparties')}
                    </ListSubheader>,
                    ...cpOptions.map((opt) => (
                        <MenuItem key={opt.value} value={opt.value}>
                            {t('accountancy.sourceRecipientCounterpartyPrefix')} {opt.label}
                        </MenuItem>
                    )),
                ]}
                {userOptions.length > 0 && [
                    <ListSubheader key="user-header" sx={{ lineHeight: 2 }}>
                        {t('accountancy.sourceRecipientUsersWithCashflow')}
                    </ListSubheader>,
                    ...userOptions.map((opt) => (
                        <MenuItem key={opt.value} value={opt.value}>
                            {t('accountancy.sourceRecipientUserPrefix')} {opt.label}
                        </MenuItem>
                    )),
                ]}
                {cfOptions.length > 0 && [
                    <ListSubheader key="cf-header" sx={{ lineHeight: 2 }}>
                        {t('accountancy.cashflow.title')}
                    </ListSubheader>,
                    ...cfOptions.map((opt) => (
                        <MenuItem key={opt.value} value={opt.value}>
                            {t('accountancy.sourceRecipientCashflowPrefix')} {opt.label}
                        </MenuItem>
                    )),
                ]}
            </Select>
        </FormControl>
    );
}
