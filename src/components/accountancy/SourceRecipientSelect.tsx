'use client';

import Autocomplete, { createFilterOptions } from '@mui/material/Autocomplete';
import ListSubheader from '@mui/material/ListSubheader';
import TextField from '@mui/material/TextField';
import { memo, useMemo } from 'react';
import type { Object as BedsObject } from '@/lib/types';
import { formatRoomSourceRecipient } from '@/lib/roomBinding';
import { normalizeMongoIdString } from '@/lib/mongoId';
import { useObjects } from '@/providers/ObjectsProvider';
import { useTranslation } from '@/i18n/useTranslation';
import type { AppLanguage } from '@/lib/accountancyCategoryResolve';
import { getInternalObjectRoomDisplayName } from '@/lib/internalObjectDisplay';
import {
    PREFIX_CF,
    PREFIX_CP,
    PREFIX_ROOM,
    PREFIX_USER,
    ROOM_FROM_BOOKING_VALUE,
    ROOM_CURRENT_VALUE,
    ROOM_CURRENT_COMMISSION_FUND_VALUE,
    ROOM_CURRENT_MANAGER_FUND_VALUE,
    ROOM_CURRENT_INTERNET_PROVIDER_VALUE,
    type ParsedSourceRecipient,
    parseSourceRecipientValue,
    type SourceRecipientOptionValue,
} from '@/lib/sourceRecipientParse';

export type {
    ParsedSourceRecipient,
    SourceRecipientOptionValue,
};

export { PREFIX_CF, PREFIX_CP, PREFIX_ROOM, PREFIX_USER, ROOM_FROM_BOOKING_VALUE, ROOM_CURRENT_VALUE, ROOM_CURRENT_COMMISSION_FUND_VALUE, ROOM_CURRENT_MANAGER_FUND_VALUE, ROOM_CURRENT_INTERNET_PROVIDER_VALUE, parseSourceRecipientValue };

const GROUP_BASE = '0';
const GROUP_OBJECTS = '2';
const GROUP_INTERNAL_OBJECTS = '6';
const GROUP_COUNTERPARTIES = '3';
const GROUP_USERS = '4';
const GROUP_CASHFLOWS = '5';

export type SourceRecipientAutocompleteOption = {
    value: SourceRecipientOptionValue | '';
    label: string;
    searchText: string;
    groupKey: string;
};

const filterOptions = createFilterOptions<SourceRecipientAutocompleteOption>({
    stringify: (option) => option.searchText,
});

/** Один раз на страницу вместо N экземпляров Autocomplete (таблица операций). */
export function buildSourceRecipientAutocompleteOptions(params: {
    objects: BedsObject[];
    counterparties: { _id: string; name: string }[];
    usersWithCashflow: { _id: string; name: string }[];
    cashflows: { _id: string; name: string }[];
    includeCashflows: boolean;
    includeBookingRoomOption: boolean;
    /** Опция «Текущая комната» (room:current) — для настроек категории */
    includeCurrentRoomOption?: boolean;
    /** Опция «Текущий фонд комиссии» */
    includeCurrentCommissionFundOption?: boolean;
    /** Опция «Текущий фонд менеджер» */
    includeCurrentManagerFundOption?: boolean;
    /** Опция «Текущий контрагент Интернет» — для настроек категории (поле «Кому») */
    includeCurrentInternetProviderOption?: boolean;
    /** Показывать список объектов/комнат; false — без Beds24-объектов */
    includeRoomList?: boolean;
    /** Филиалы внутренних объектов (id < 0) — для настроек категории */
    includeInternalObjectsList?: boolean;
    language?: AppLanguage;
    t: (key: string) => string;
}): SourceRecipientAutocompleteOption[] {
    const {
        objects,
        counterparties,
        usersWithCashflow,
        cashflows,
        includeCashflows,
        includeBookingRoomOption,
        includeCurrentRoomOption = false,
        includeCurrentCommissionFundOption = false,
        includeCurrentManagerFundOption = false,
        includeCurrentInternetProviderOption = false,
        includeRoomList = true,
        includeInternalObjectsList = false,
        language = 'ru',
        t,
    } = params;

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

    if (includeCurrentRoomOption) {
        const currentRoomLabel = t('accountancy.sourceRecipientCurrentRoom');
        list.push({
            value: ROOM_CURRENT_VALUE,
            label: currentRoomLabel,
            searchText: currentRoomLabel,
            groupKey: GROUP_BASE,
        });
    }

    if (includeCurrentCommissionFundOption) {
        const label = t('accountancy.sourceRecipientCurrentCommissionFund');
        list.push({
            value: ROOM_CURRENT_COMMISSION_FUND_VALUE,
            label,
            searchText: label,
            groupKey: GROUP_BASE,
        });
    }

    if (includeCurrentManagerFundOption) {
        const label = t('accountancy.sourceRecipientCurrentManagerFund');
        list.push({
            value: ROOM_CURRENT_MANAGER_FUND_VALUE,
            label,
            searchText: label,
            groupKey: GROUP_BASE,
        });
    }

    if (includeCurrentInternetProviderOption) {
        const label = t('accountancy.sourceRecipientCurrentInternetProvider');
        list.push({
            value: ROOM_CURRENT_INTERNET_PROVIDER_VALUE,
            label,
            searchText: label,
            groupKey: GROUP_BASE,
        });
    }

    if (includeRoomList) {
        objects.forEach((obj) => {
            const isInternalObject = obj.id < 0;
            obj.roomTypes?.forEach((room) => {
                const stableName =
                    room.name != null && String(room.name).trim() !== ''
                        ? String(room.name).trim()
                        : `Unit ${room.id}`;
                const roomPart = isInternalObject
                    ? getInternalObjectRoomDisplayName(room, language) || `Room ${room.id}`
                    : room.name || `Room ${room.id}`;
                const roomLabel = `${obj.name} — ${roomPart}`;
                list.push({
                    value: formatRoomSourceRecipient(obj.id, stableName),
                    label: roomLabel,
                    searchText: `${obj.name} ${room.name || ''} ${room.nameEn || ''} ${room.id}`.trim(),
                    groupKey: isInternalObject ? GROUP_INTERNAL_OBJECTS : GROUP_OBJECTS,
                });
            });
        });
    }

    if (includeInternalObjectsList) {
        objects
            .filter((obj) => obj.id < 0)
            .forEach((obj) => {
                obj.roomTypes?.forEach((room) => {
                    const stableName =
                        room.name != null && String(room.name).trim() !== ''
                            ? String(room.name).trim()
                            : `Unit ${room.id}`;
                    const roomDisplayName = getInternalObjectRoomDisplayName(room, language);
                    const roomLabel = `${obj.name} — ${roomDisplayName || `Room ${room.id}`}`;
                    list.push({
                        value: formatRoomSourceRecipient(obj.id, stableName),
                        label: roomLabel,
                        searchText: `${obj.name} ${room.name || ''} ${room.nameEn || ''} ${room.id}`.trim(),
                        groupKey: GROUP_INTERNAL_OBJECTS,
                    });
                });
            });
    }

    const cpPrefix = t('accountancy.sourceRecipientCounterpartyPrefix');
    counterparties.forEach((c) => {
        const id = normalizeMongoIdString(c._id).trim();
        if (!id) return;
        const labelText = `${cpPrefix} ${c.name}`.trim();
        list.push({
            value: `${PREFIX_CP}${id}` as SourceRecipientOptionValue,
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
}

export function formatSourceRecipientLabel(
    value: SourceRecipientOptionValue | undefined,
    objects: { id: number; name: string; roomTypes: { id: number; name: string; nameEn?: string | null }[] }[],
    counterparties: { _id: string; name: string }[],
    usersWithCashflow?: { _id: string; name: string }[],
    cashflows?: { _id: string; name: string }[],
    /** Подпись для «room:from_booking» (правила автоучёта); иначе запасной текст на англ. */
    roomFromBookingLabel?: string,
    /** Подпись для «room:current» (настройки категории) */
    currentRoomLabel?: string,
    currentCommissionFundLabel?: string,
    currentManagerFundLabel?: string,
    currentInternetProviderLabel?: string,
    language: AppLanguage = 'ru',
): string {
    const parsed = parseSourceRecipientValue(value);
    if (!parsed) return '—';
    if (parsed.type === 'room_from_booking') {
        return roomFromBookingLabel ?? 'Room from booking';
    }
    if (parsed.type === 'room_current') {
        return currentRoomLabel ?? 'Current room';
    }
    if (parsed.type === 'room_current_commission_fund') {
        return currentCommissionFundLabel ?? 'Current commission fund';
    }
    if (parsed.type === 'room_current_manager_fund') {
        return currentManagerFundLabel ?? 'Current manager fund';
    }
    if (parsed.type === 'room_current_internet_provider') {
        return currentInternetProviderLabel ?? 'Current internet provider';
    }
    if (parsed.type === 'room') {
        const obj = objects.find((o) => o.id === parsed.objectId);
        const room = obj?.roomTypes?.find((r) => (r.name || '').trim() === (parsed.roomName || '').trim());
        if (obj && room) {
            const roomLabel =
                obj.id < 0
                    ? getInternalObjectRoomDisplayName(room, language) || `Room ${room.id}`
                    : room.name || `Room ${room.id}`;
            return `${obj.name} — ${roomLabel}`;
        }
        return `Object ${parsed.objectId}, ${parsed.roomName}`;
    }
    if (parsed.type === 'counterparty') {
        const cp = counterparties.find((c) => normalizeMongoIdString(c._id) === parsed.id);
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
    /** Пустая строка или значение; `undefined` трактуется как «не выбрано» (= «—»), чтобы Autocomplete не переключался uncontrolled → controlled */
    value: SourceRecipientOptionValue | '' | undefined;
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
    /** Опция «Текущая комната» — для настроек категории */
    includeCurrentRoomOption?: boolean;
    includeCurrentCommissionFundOption?: boolean;
    includeCurrentManagerFundOption?: boolean;
    includeCurrentInternetProviderOption?: boolean;
    /** Показывать список объектов/комнат */
    includeRoomList?: boolean;
    /** Филиалы внутренних объектов (id < 0) */
    includeInternalObjectsList?: boolean;
    size?: 'small' | 'medium';
    sx?: object;
    error?: boolean;
    disabled?: boolean;
    /** Без плавающей подписи (placeholder + aria-label) — для плотных таблиц */
    hideLabel?: boolean;
    /** Минимальная ширина выпадающего попапа; если не задана — попап совпадает с шириной поля ввода */
    popperMinWidth?: number;
    /** Список опций с родителя — без повторной сборки на каждую строку таблицы */
    prefetchedOptions?: SourceRecipientAutocompleteOption[];
}

function SourceRecipientSelectInner({
    value,
    onChange,
    label,
    counterparties,
    usersWithCashflow = [],
    cashflows = [],
    includeCashflows = false,
    includeBookingRoomOption = false,
    includeCurrentRoomOption = false,
    includeCurrentCommissionFundOption = false,
    includeCurrentManagerFundOption = false,
    includeCurrentInternetProviderOption = false,
    includeRoomList = true,
    includeInternalObjectsList = false,
    size = 'small',
    sx,
    error,
    disabled = false,
    hideLabel = false,
    popperMinWidth,
    prefetchedOptions,
}: SourceRecipientSelectProps) {
    const { objects } = useObjects();
    const { t, language } = useTranslation();

    const options = useMemo((): SourceRecipientAutocompleteOption[] => {
        if (prefetchedOptions) return prefetchedOptions;
        return buildSourceRecipientAutocompleteOptions({
            objects,
            counterparties,
            usersWithCashflow,
            cashflows,
            includeCashflows,
            includeBookingRoomOption,
            includeCurrentRoomOption,
            includeCurrentCommissionFundOption,
            includeCurrentManagerFundOption,
            includeCurrentInternetProviderOption,
            includeRoomList,
            includeInternalObjectsList,
            language,
            t,
        });
    }, [
        prefetchedOptions,
        objects,
        counterparties,
        usersWithCashflow,
        cashflows,
        includeCashflows,
        includeBookingRoomOption,
        includeCurrentRoomOption,
        includeCurrentCommissionFundOption,
        includeCurrentManagerFundOption,
        includeCurrentInternetProviderOption,
        includeRoomList,
        includeInternalObjectsList,
        language,
        t,
    ]);

    const normalizedValue = value ?? '';
    const selectedOption = useMemo((): SourceRecipientAutocompleteOption | undefined => {
        if (!normalizedValue) {
            return options.find((o) => o.value === '') ?? undefined;
        }
        const found = options.find((o) => o.value === normalizedValue);
        if (found) return found;

        const parsed = parseSourceRecipientValue(normalizedValue as SourceRecipientOptionValue);
        const cpPrefix = t('accountancy.sourceRecipientCounterpartyPrefix');
        const label = formatSourceRecipientLabel(
            normalizedValue as SourceRecipientOptionValue,
            objects,
            counterparties,
            usersWithCashflow,
            cashflows,
            t('accountancy.sourceRecipientRoomFromBooking'),
            t('accountancy.sourceRecipientCurrentRoom'),
            t('accountancy.sourceRecipientCurrentCommissionFund'),
            t('accountancy.sourceRecipientCurrentManagerFund'),
            t('accountancy.sourceRecipientCurrentInternetProvider'),
            language,
        );
        const displayLabel =
            parsed?.type === 'counterparty' && label !== '—'
                ? `${cpPrefix} ${label}`.trim()
                : label !== '—'
                  ? label
                  : normalizedValue;

        return {
            value: normalizedValue as SourceRecipientOptionValue,
            label: displayLabel,
            searchText: displayLabel,
            groupKey:
                parsed?.type === 'counterparty'
                    ? GROUP_COUNTERPARTIES
                    : parsed?.type === 'room'
                      ? objects.find((o) => o.id === parsed.objectId)?.id != null &&
                        objects.find((o) => o.id === parsed.objectId)!.id < 0
                          ? GROUP_INTERNAL_OBJECTS
                          : GROUP_OBJECTS
                      : GROUP_BASE,
        };
    }, [
        options,
        normalizedValue,
        objects,
        counterparties,
        usersWithCashflow,
        cashflows,
        t,
        language,
    ]);

    const groupHeaders = useMemo(
        () => ({
            [GROUP_OBJECTS]: t('accountancy.sourceRecipientObjectsRooms'),
            [GROUP_INTERNAL_OBJECTS]: t('accountancy.sourceRecipientInternalObjects'),
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
                popper: popperMinWidth != null
                    ? { sx: { minWidth: popperMinWidth, width: 'auto !important' } }
                    : undefined,
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
            renderInput={(params) =>
                hideLabel ? (
                    <TextField
                        {...params}
                        hiddenLabel
                        multiline
                        minRows={1}
                        maxRows={6}
                        error={error}
                        placeholder={label}
                        inputProps={{
                            ...params.inputProps,
                            'aria-label': label,
                        }}
                    />
                ) : (
                    <TextField {...params} label={label} error={error} placeholder={t('common.search')} />
                )
            }
        />
    );
}

const SourceRecipientSelect = memo(SourceRecipientSelectInner);
export default SourceRecipientSelect;
