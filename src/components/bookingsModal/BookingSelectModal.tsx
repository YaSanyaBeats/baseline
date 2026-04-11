'use client'

import { useEffect, useState } from "react";
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
import { Booking, InvoiceItem, Object as Obj } from "@/lib/types";
import { searchBookings, BookingSearchParams } from "@/lib/bookings";
import { useTranslation } from "@/i18n/useTranslation";
import { useObjects } from "@/providers/ObjectsProvider";
import { formatDate, formatTitle } from "@/lib/format";

const getMaxInvoice = (invoiceItems: InvoiceItem[] | undefined | null) => {
    let maxInvoice: InvoiceItem | undefined;
    (invoiceItems ?? []).forEach((invoiceItem) => {
        if (invoiceItem.type !== "charge") {
            return;
        }
        if (!maxInvoice || invoiceItem.lineTotal > maxInvoice.lineTotal) {
            maxInvoice = invoiceItem;
        }
    });
    return maxInvoice;
};

const getBookingPrice = (booking: Booking) =>
    getMaxInvoice(booking.invoiceItems)?.lineTotal ?? 0;

interface BookingSelectModalProps {
    open: boolean;
    onClose: () => void;
    onSelect: (booking: Booking) => void;
    initialObjectId?: number;
}

export default function BookingSelectModal({
    open,
    onClose,
    onSelect,
    initialObjectId,
}: BookingSelectModalProps) {
    const { t } = useTranslation();
    const { objects } = useObjects();

    const [filters, setFilters] = useState<BookingSearchParams>({
        objectId: initialObjectId,
        query: "",
        from: "",
        to: "",
    });
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState<Booking[]>([]);

    useEffect(() => {
        if (open && initialObjectId && !filters.objectId) {
            setFilters((prev) => ({ ...prev, objectId: initialObjectId }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, initialObjectId]);

    /** В коллекции bookings поле propertyId совпадает с object.propertyId (Beds24), а не всегда с object.id из списка объектов. */
    const bookingPropertyIdForApi = (internalObjectId?: number): number | undefined => {
        if (internalObjectId == null) return undefined;
        const o = objects.find((x) => x.id === internalObjectId);
        if (o) return o.propertyId ?? o.id;
        return internalObjectId;
    };

    const handleSearch = async () => {
        const apiParams: BookingSearchParams = {
            ...filters,
            objectId: bookingPropertyIdForApi(filters.objectId),
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
    };

    const handleSelectBooking = (booking: Booking) => {
        onSelect(booking);
        onClose();
    };

    const handleChangeObject = (event: any) => {
        const value = event.target.value;
        setFilters((prev) => ({
            ...prev,
            objectId: value ? Number(value) : undefined,
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

    const getRoomNameForBooking = (booking: Booking, objs: Obj[]) => {
        const pid = booking.propertyId;
        const uid =
            booking.unitId != null ? Number(booking.unitId) : null;
        const bRoomRaw = booking.roomId ?? booking.roomID;
        const bRoom = bRoomRaw != null ? Number(bRoomRaw) : null;
        const pidNum = pid != null ? Number(pid) : NaN;

        /** Объекты с тем же property (в т.ч. несколько строк room type с одним propertyId). */
        let scope: Obj[] =
            pid == null || Number.isNaN(pidNum)
                ? objs
                : objs.filter(
                      (o) =>
                          Number(o.propertyId ?? o.id) === pidNum ||
                          Number(o.id) === pidNum,
                  );
        if (pid != null && !Number.isNaN(pidNum) && scope.length === 0) {
            scope = objs;
        }

        const roomNameFromRoomTypes = (
            roomNumericId: number | null,
            searchIn: Obj[],
        ): string | null => {
            if (roomNumericId == null || Number.isNaN(roomNumericId)) {
                return null;
            }
            for (const o of searchIn) {
                const unit = o.roomTypes?.find(
                    (r) => Number(r.id) === roomNumericId,
                );
                if (unit) {
                    const n = unit.name?.trim();
                    return n || `Room ${unit.id}`;
                }
            }
            return null;
        };

        const byUnit = roomNameFromRoomTypes(uid, scope);
        if (byUnit) return byUnit;

        const byUnitGlobal =
            scope !== objs ? roomNameFromRoomTypes(uid, objs) : null;
        if (byUnitGlobal) return byUnitGlobal;

        const byRoomId = roomNameFromRoomTypes(bRoom, scope);
        if (byRoomId) return byRoomId;

        const byRoomIdGlobal =
            scope !== objs ? roomNameFromRoomTypes(bRoom, objs) : null;
        if (byRoomIdGlobal) return byRoomIdGlobal;

        if (bRoom != null && !Number.isNaN(bRoom)) {
            const obj = objs.find((o) => Number(o.id) === bRoom);
            const propertyIdNum = Number(obj?.propertyId ?? obj?.id);
            if (
                obj &&
                Number(obj.id) !== propertyIdNum &&
                obj.name?.trim()
            ) {
                return obj.name.trim();
            }
        }

        if (uid != null && !Number.isNaN(uid)) return String(uid);
        if (bRoom != null && !Number.isNaN(bRoom)) return String(bRoom);
        return "—";
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
                                <TableCell>ID</TableCell>
                                <TableCell>{t("common.name")}</TableCell>
                                <TableCell>{t("common.roomName")}</TableCell>
                                <TableCell>{t("common.period")}</TableCell>
                                <TableCell>{t("common.price")}</TableCell>
                                <TableCell align="right">{t("common.actions")}</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {results.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} align="center">
                                        <Typography sx={{ py: 2 }}>
                                            {t("accountancy.noFilteredReports")}
                                        </Typography>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                results.map((booking) => (
                                    <TableRow key={booking.id} hover>
                                        <TableCell>{booking.id}</TableCell>
                                        <TableCell>
                                            {formatTitle(
                                                (booking as any).firstName,
                                                (booking as any).lastName,
                                                booking.title,
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {getRoomNameForBooking(booking, objects)}
                                        </TableCell>
                                        <TableCell>
                                            {formatDate(booking.arrival)} -{" "}
                                            {formatDate(booking.departure)}
                                        </TableCell>
                                        <TableCell>
                                            {getBookingPrice(booking)} ฿
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
                                ))
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

