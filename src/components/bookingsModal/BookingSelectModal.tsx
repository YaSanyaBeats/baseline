'use client'

import { useCallback, useEffect, useRef, useState } from "react";
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    TextField,
    Stack,
    Box,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Typography,
} from "@mui/material";
import { BookingGroupLineText } from "@/components/accountancy/BookingGroupLineText";
import { buildBookingGroupLineModel } from "@/lib/bookingGroupLine";
import { Booking } from "@/lib/types";
import { searchBookings, BookingSearchParams } from "@/lib/bookings";
import { useTranslation } from "@/i18n/useTranslation";
import { useObjects } from "@/providers/ObjectsProvider";
const toYmd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** «От»/«До» от сегодня, если нет валидного месяца отчёта */
function getDefaultBookingDateRangeFromToday(): { from: string; to: string } {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    return {
        from: toYmd(new Date(y, m - 3, 1)),
        to: toYmd(new Date(y, m + 1, 1)),
    };
}

/**
 * «От» — 1-е число (месяц отчёта − 3), «До» — 1-е число (месяц отчёта + 1).
 * Пример: отчёт 2025-12 → 2025-09-01 .. 2026-01-01
 */
function getDefaultBookingDateRangeForReportMonth(
    reportMonth: string | undefined | null,
): { from: string; to: string } {
    const valid =
        reportMonth && /^\d{4}-\d{2}$/.test(reportMonth) ? reportMonth : null;
    if (!valid) {
        return getDefaultBookingDateRangeFromToday();
    }
    const [yStr, mStr] = valid.split("-");
    const y = Number(yStr);
    const m0 = Number(mStr) - 1;
    if (!Number.isFinite(y) || !Number.isFinite(m0) || m0 < 0 || m0 > 11) {
        return getDefaultBookingDateRangeFromToday();
    }
    return {
        from: toYmd(new Date(y, m0 - 3, 1)),
        to: toYmd(new Date(y, m0 + 1, 1)),
    };
}

interface BookingSelectModalProps {
    open: boolean;
    onClose: () => void;
    onSelect: (booking: Booking) => void;
    initialObjectId?: number;
    /** YYYY-MM: диапазон дат «От»/«До» считается от этого месяца отчёта, не от сегодня */
    reportMonth?: string;
    /** Комната из формы (id в roomTypes объекта) — подставляется в фильтр при открытии */
    initialRoomId?: number;
}

export default function BookingSelectModal({
    open,
    onClose,
    onSelect,
    initialObjectId,
    reportMonth,
    initialRoomId,
}: BookingSelectModalProps) {
    const { t } = useTranslation();
    const { objects } = useObjects();

    const [filters, setFilters] = useState<BookingSearchParams>({
        objectId: undefined,
        roomId: undefined,
        query: "",
        from: "",
        to: "",
    });
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState<Booking[]>([]);
    const wasOpenRef = useRef(false);

    /** В коллекции bookings поле propertyId совпадает с object.propertyId (Beds24), а не всегда с object.id из списка объектов. */
    const bookingPropertyIdForApi = useCallback(
        (internalObjectId?: number): number | undefined => {
            if (internalObjectId == null) return undefined;
            const o = objects.find((x) => x.id === internalObjectId);
            if (o) return o.propertyId ?? o.id;
            return internalObjectId;
        },
        [objects],
    );

    const runSearchWithFilters = useCallback(
        async (f: BookingSearchParams) => {
            const apiParams: BookingSearchParams = {
                ...f,
                objectId: bookingPropertyIdForApi(f.objectId),
            };
            setLoading(true);
            try {
                const data = await searchBookings(apiParams);
                setResults(data);
            } catch (error) {
                console.error("Error searching bookings:", error);
            } finally {
                setLoading(false);
            }
        },
        [bookingPropertyIdForApi],
    );

    useEffect(() => {
        if (open) {
            const justOpened = !wasOpenRef.current;
            if (justOpened) {
                const { from, to } =
                    getDefaultBookingDateRangeForReportMonth(reportMonth);
                const next: BookingSearchParams = {
                    objectId: initialObjectId,
                    roomId:
                        initialObjectId != null && initialRoomId != null
                            ? initialRoomId
                            : undefined,
                    query: "",
                    from,
                    to,
                };
                setFilters(next);
                void runSearchWithFilters(next);
            }
            wasOpenRef.current = true;
        } else {
            wasOpenRef.current = false;
        }
    }, [open, initialObjectId, initialRoomId, reportMonth, runSearchWithFilters]);

    const handleSearch = () => {
        void runSearchWithFilters(filters);
    };

    const handleSelectBooking = (booking: Booking) => {
        onSelect(booking);
        onClose();
    };

    const handleChangeObject = (event: any) => {
        const value = event.target.value;
        const newObjectId = value ? Number(value) : undefined;
        setFilters((prev) => {
            const next: BookingSearchParams = { ...prev, objectId: newObjectId };
            if (newObjectId == null) {
                next.roomId = undefined;
            } else {
                const o = objects.find((x) => x.id === newObjectId);
                const roomIds = o?.roomTypes?.map((r) => r.id) ?? [];
                if (prev.roomId != null && !roomIds.includes(prev.roomId)) {
                    next.roomId = undefined;
                }
            }
            return next;
        });
    };

    const handleChangeRoom = (event: { target: { value: string } }) => {
        const value = event.target.value;
        setFilters((prev) => ({
            ...prev,
            roomId: value ? Number(value) : undefined,
        }));
    };

    const handleChangeField =
        (field: "query" | "from" | "to") =>
        (event: React.ChangeEvent<HTMLInputElement>) => {
            const value = event.target.value;
            setFilters((prev) => ({
                ...prev,
                [field]: value,
            }));
        };

    return (
        <Dialog
            open={open}
            onClose={onClose}
            fullWidth
            maxWidth="lg"
        >
            <DialogTitle>{t("bookings.title")}</DialogTitle>
            <DialogContent dividers>
                <Stack spacing={2} sx={{ mb: 2 }}>
                    <Stack
                        direction={{ xs: "column", md: "row" }}
                        spacing={2}
                        flexWrap="wrap"
                    >
                        <FormControl sx={{ minWidth: 180 }}>
                            <InputLabel>{t("common.object")}</InputLabel>
                            <Select
                                value={filters.objectId ?? ""}
                                label={t("common.object")}
                                onChange={handleChangeObject}
                            >
                                <MenuItem value="">{t("accountancy.all")}</MenuItem>
                                {objects.map((obj) => (
                                    <MenuItem key={`${obj.propertyName || 'obj'}-${obj.id}`} value={String(obj.id)}>
                                        {obj.name}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <FormControl
                            sx={{ minWidth: 200 }}
                            disabled={!filters.objectId}
                        >
                            <InputLabel>{t("common.room")}</InputLabel>
                            <Select
                                value={filters.roomId != null ? String(filters.roomId) : ""}
                                label={t("common.room")}
                                onChange={handleChangeRoom}
                            >
                                <MenuItem value="">{t("accountancy.all")}</MenuItem>
                                {(objects.find((o) => o.id === filters.objectId)?.roomTypes ?? []).map(
                                    (r) => (
                                        <MenuItem key={`room-${r.id}`} value={String(r.id)}>
                                            {r.name}
                                        </MenuItem>
                                    ),
                                )}
                            </Select>
                        </FormControl>
                        <TextField
                            label={t("common.search")}
                            value={filters.query || ""}
                            onChange={handleChangeField("query")}
                            sx={{ minWidth: 220 }}
                        />
                        <TextField
                            label={t("analytics.from")}
                            type="date"
                            InputLabelProps={{ shrink: true }}
                            value={filters.from || ""}
                            onChange={handleChangeField("from")}
                        />
                        <TextField
                            label={t("analytics.to")}
                            type="date"
                            InputLabelProps={{ shrink: true }}
                            value={filters.to || ""}
                            onChange={handleChangeField("to")}
                        />
                        <Box sx={{ display: "flex", alignItems: "center" }}>
                            <Button
                                variant="contained"
                                onClick={handleSearch}
                                disabled={loading}
                            >
                                {t("common.search")}
                            </Button>
                        </Box>
                    </Stack>
                </Stack>

                <TableContainer component={Paper}>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>{t("common.name")}</TableCell>
                                <TableCell align="right">{t("common.select")}</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {results.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={2} align="center">
                                        <Typography sx={{ py: 2 }}>
                                            {t("accountancy.noFilteredReports")}
                                        </Typography>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                results.map((booking) => {
                                    const groupLine = buildBookingGroupLineModel(booking);
                                    return (
                                    <TableRow key={booking.id} hover>
                                        <TableCell>
                                            <BookingGroupLineText line={groupLine} />
                                        </TableCell>
                                        <TableCell align="right">
                                            <Button
                                                variant="outlined"
                                                size="small"
                                                onClick={() => handleSelectBooking(booking)}
                                            >
                                                {t("common.select")}
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>{t("common.close")}</Button>
            </DialogActions>
        </Dialog>
    );
}

