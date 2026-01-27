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
import { Booking, Object as Obj } from "@/lib/types";
import { searchBookings, BookingSearchParams } from "@/lib/bookings";
import { useTranslation } from "@/i18n/useTranslation";
import { useObjects } from "@/providers/ObjectsProvider";
import { formatDate, formatTitle } from "@/lib/format";

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

    const handleSearch = async () => {
        setLoading(true);
        try {
            const data = await searchBookings(filters);
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

    const getObjectName = (booking: any, objs: Obj[]) => {
        const object = objs.find((o) => o.id === booking.propertyId);
        return object ? object.name : booking.propertyId ?? "";
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
                                    <MenuItem key={obj.id} value={String(obj.id)}>
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
                                <TableCell>{t("common.object")}</TableCell>
                                <TableCell>{t("common.period")}</TableCell>
                                <TableCell>{t("common.status")}</TableCell>
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
                                            {getObjectName(booking, objects)}
                                        </TableCell>
                                        <TableCell>
                                            {formatDate(booking.arrival)} -{" "}
                                            {formatDate(booking.departure)}
                                        </TableCell>
                                        <TableCell>{booking.status}</TableCell>
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

