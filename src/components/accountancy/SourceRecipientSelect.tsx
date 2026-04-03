'use client';

import Autocomplete, { createFilterOptions } from '@mui/material/Autocomplete';
import ListSubheader from '@mui/material/ListSubheader';
import TextField from '@mui/material/TextField';
import { useMemo } from 'react';
import { useObjects } from '@/providers/ObjectsProvider';
import { useTranslation } from '@/i18n/useTranslation';
import {
    PREFIX_CF,
    PREFIX_CP,
    PREFIX_ROOM,
    PREFIX_USER,
    ROOM_FROM_BOOKING_VALUE,
    type ParsedSourceRecipient,
    parseSourceRecipientValue,
    type SourceRecipientOptionValue,
} from '@/lib/sourceRecipientParse';

export type {
    ParsedSourceRecipient,
    SourceRecipientOptionValue,
};

export { PREFIX_CF, PREFIX_CP, PREFIX_ROOM, PREFIX_USER, ROOM_FROM_BOOKING_VALUE, parseSourceRecipientValue };

const GROUP_BASE = '0';
const GROUP_OBJECTS = '2';
const GROUP_COUNTERPARTIES = '3';
const GROUP_USERS = '4';
const GROUP_CASHFLOWS = '5';

type SourceRecipientAutocompleteOption = {
    value: SourceRecipientOptionValue | '';
    label: string;
    searchText: string;
    groupKey: string;
};

const filterOptions = createFilterOptions<SourceRecipientAutocompleteOption>({
    stringify: (option) => option.searchText,
});

export function formatSourceRecipientLabel(
    value: SourceRecipientOptionValue | undefined,
    objects: { id: number; name: string; roomTypes: { id: number; name: string }[] }[],
    counterparties: { _id: string; name: string }[],
    usersWithCashflow?: { _id: string; name: string }[],
    cashflows?: { _id: string; name: string }[],
    /** Подпись для «room:from_booking» (правила автоучёта); иначе запасной текст на англ. */
    roomFromBookingLabel?: string
): string {
    const parsed = parseSourceRecipientValue(value);
    if (!parsed) return '—';
    if (parsed.type === 'room_from_booking') {
        return roomFromBookingLabel ?? 'Room from booking';
    }
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
    /** Опция «комната из брони» — для правил автоучёта */
    includeBookingRoomOption?: boolean;
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
    includeBookingRoomOption = false,
    size = 'small',
    sx,
    error,
    disabled = false,
}: SourceRecipientSelectProps) {
    const { objects } = useObjects();
    const { t } = useTranslation();

    const options = useMemo((): SourceRecipientAutocompleteOption[] => {
        const list: SourceRecipientAutocompleteOption[] = [];

        list.push({
            value: '',
            label: '—',
            searchText: '—',
            groupKey: GROUP_BASE,
        });

        if (includeBookingRoomOption) {
            const bookingLabel = t('accountancy.sourceRecipientRoomFromBooking');
            list.push({
                value: ROOM_FROM_BOOKING_VALUE,
                label: bookingLabel,
                searchText: bookingLabel,
                groupKey: GROUP_BASE,
            });
        }

        objects.forEach((obj) => {
            obj.roomTypes?.forEach((room) => {
                const roomLabel = `${obj.name} — ${room.name || `Room ${room.id}`}`;
                list.push({
                    value: `${PREFIX_ROOM}${obj.id}:${room.id}`,
                    label: roomLabel,
                    searchText: `${obj.name} ${room.name || ''} ${room.id}`.trim(),
                    groupKey: GROUP_OBJECTS,
                });
            });
        });

        const cpPrefix = t('accountancy.sourceRecipientCounterpartyPrefix');
        counterparties.forEach((c) => {
            const labelText = `${cpPrefix} ${c.name}`.trim();
            list.push({
                value: `${PREFIX_CP}${c._id}` as SourceRecipientOptionValue,
                label: labelText,
                searchText: `${c.name} ${cpPrefix}`,
                groupKey: GROUP_COUNTERPARTIES,
            });
        });

        const userPrefix = t('accountancy.sourceRecipientUserPrefix');
        usersWithCashflow.forEach((u) => {
            const idStr = typeof u._id === 'string' ? u._id : String(u._id);
            const labelText = `${userPrefix} ${u.name}`.trim();
            list.push({
                value: `${PREFIX_USER}${idStr}` as SourceRecipientOptionValue,
                label: labelText,
                searchText: `${u.name} ${userPrefix}`,
                groupKey: GROUP_USERS,
            });
        });

        if (includeCashflows) {
            const cfPrefix = t('accountancy.sourceRecipientCashflowPrefix');
            cashflows.forEach((c) => {
                const labelText = `${cfPrefix} ${c.name}`.trim();
                list.push({
                    value: `${PREFIX_CF}${c._id}` as SourceRecipientOptionValue,
                    label: labelText,
                    searchText: `${c.name} ${cfPrefix}`,
                    groupKey: GROUP_CASHFLOWS,
                });
            });
        }

        return list;
    }, [objects, counterparties, usersWithCashflow, cashflows, includeCashflows, includeBookingRoomOption, t]);

    const selectedOption = useMemo(() => options.find((o) => o.value === value), [options, value]);

    const groupHeaders = useMemo(
        () => ({
            [GROUP_OBJECTS]: t('accountancy.sourceRecipientObjectsRooms'),
            [GROUP_COUNTERPARTIES]: t('accountancy.sourceRecipientCounterparties'),
            [GROUP_USERS]: t('accountancy.sourceRecipientUsersWithCashflow'),
            [GROUP_CASHFLOWS]: t('accountancy.cashflow.title'),
        }),
        [t]
    );

    return (
        <Autocomplete<SourceRecipientAutocompleteOption, false, true, false>
            disabled={disabled}
            options={options}
            value={selectedOption}
            onChange={(_, newValue) => {
                onChange(newValue?.value ?? '');
            }}
            filterOptions={filterOptions}
            groupBy={(option) => option.groupKey}
            getOptionLabel={(option) => option.label}
            isOptionEqualToValue={(a, b) => a.value === b.value}
            disableClearable
            selectOnFocus
            handleHomeEndKeys
            size={size}
            sx={{ minWidth: 200, ...sx }}
            slotProps={{
                listbox: {
                    sx: { maxHeight: 360, p: 0 },
                },
            }}
            renderGroup={(params) => {
                const header = groupHeaders[params.group as keyof typeof groupHeaders];
                return (
                    <li key={params.key}>
                        {header ? (
                            <ListSubheader component="div" sx={{ lineHeight: 2 }}>
                                {header}
                            </ListSubheader>
                        ) : null}
                        <ul className="MuiAutocomplete-groupUl">{params.children}</ul>
                    </li>
                );
            }}
            renderInput={(params) => (
                <TextField {...params} label={label} error={error} placeholder={t('common.search')} />
            )}
        />
    );
}
