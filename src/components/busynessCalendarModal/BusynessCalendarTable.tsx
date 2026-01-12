import { BusynessRow, BusynessBookingInfo } from "@/lib/types";
import { Box, Paper, Typography, Tooltip } from "@mui/material";
import { useTranslation } from "@/i18n/useTranslation";

function getDoubleNumber(value: number) {
    if(value <= 9) {
        return '0' + value;
    }
    return value;
}

type SegmentType = "busyness" | "black";

interface Segment {
    startIndex: number;
    endIndex: number;
    type: SegmentType;
    booking: BusynessBookingInfo | null;
}

const getSegments = (row: BusynessRow): Segment[] => {
    console.log(row);
    const segments: Segment[] = [];
    let current: Segment | null = null;
    row.busyness.forEach((item, index) => {
        
        if (item.busyness === "free") {
            if (current) {
                segments.push({ ...current, endIndex: index - 1 });
                current = null;
            }
            return;
        }

        if (!current) {
            current = {
                startIndex: index,
                endIndex: index,
                type: item.busyness as SegmentType,
                booking: item.booking || null,
            };
        } else if (current.type === item.busyness && 
                   ((!current.booking && !item.booking) || 
                    (current.booking && item.booking && current.booking.id === item.booking.id))) {
            current.endIndex = index;
        } else {
            segments.push({ ...current });
            current = {
                startIndex: index,
                endIndex: index,
                type: item.busyness as SegmentType,
                booking: item.booking || null,
            };
        }
    });

    if (current) {
        segments.push(current);
    }

    return segments;
};

const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const getBookingFullName = (booking: BusynessBookingInfo | null): string => {
    if (!booking) {
        return '';
    }
    
    const parts: string[] = [];
    
    if (booking.title) {
        parts.push(booking.title);
    }
    
    if (booking.firstName) {
        parts.push(booking.firstName);
    }

    if (booking.lastName) {
        parts.push(booking.lastName);
    }
    
    return parts.join(' ');
};

const getWeekdayShort = (dateString: string, t: (key: string) => string) => {
    const date = new Date(dateString);
    const day = date.getDay(); // 0 - Sunday
    const map = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    return t(`calendar.weekdays.short.${map[day]}`);
};

export default function BusynessCalendarTable(props: { busynessItems: BusynessRow[] }) {
    const { busynessItems } = props;
    const { t } = useTranslation();

    if (!busynessItems.length || !busynessItems[0].busyness.length) {
        return null;
    }

    const days = busynessItems[0].busyness;
    const daysCount = days.length;
    const firstColumnWidth = 180;

    return (
        <Paper sx={{ p: 2, overflowX: "auto" }}>
            <Box sx={{ minWidth: 650 }}>
                {/* Заголовок с днями недели и числами */}
                <Box
                    sx={{
                        display: "grid",
                        gridTemplateColumns: `${firstColumnWidth}px repeat(${daysCount}, minmax(0, 1fr))`,
                        alignItems: "stretch",
                        columnGap: 0.5,
                    }}
                >
                    <Box />
                    {days.map((item, index) => (
                        <Box
                            key={index}
                            sx={{
                                textAlign: "center",
                                fontSize: 12,
                                color: "text.secondary",
                                borderLeft: "1px solid rgba(224, 224, 224, 0.6)",
                                pt: 0.5,
                            }}
                        >
                            <Typography variant="caption" sx={{ display: "block", lineHeight: 1 }}>
                                {getWeekdayShort(item.date, t)}
                            </Typography>
                            <Typography variant="caption" sx={{ fontWeight: 500, lineHeight: 1.2 }}>
                                {getDoubleNumber(new Date(item.date).getDate())}
                            </Typography>
                        </Box>
                    ))}
                </Box>

                {/* Строки по комнатам */}
                {busynessItems.map((row, rowIndex) => {
                    const segments = getSegments(row);

                    return (
                        <Box
                            key={rowIndex}
                            sx={{
                                display: "grid",
                                gridTemplateColumns: `${firstColumnWidth}px repeat(${daysCount}, minmax(0, 1fr))`,
                                gridTemplateRows: "40px",
                                alignItems: "stretch",
                                columnGap: 0.5,
                                position: "relative",
                            }}
                        >
                            {/* Название комнаты */}
                            <Box
                                sx={{
                                    gridColumn: "1 / 2",
                                    gridRow: "1 / 2",
                                    display: "flex",
                                    alignItems: "center",
                                    whiteSpace: "nowrap",
                                    pr: 1,
                                    fontSize: 14,
                                    fontWeight: 500,
                                    borderBottom: "1px solid rgba(224, 224, 224, 1)",
                                }}
                            >
                                {row.roomName}
                            </Box>

                            {/* Фоновая сетка дней */}
                            {days.map((_, dayIndex) => (
                                <Box
                                    key={dayIndex}
                                    sx={{
                                        gridColumn: `${dayIndex + 2} / ${dayIndex + 3}`,
                                        gridRow: "1 / 2",
                                        borderLeft: "1px solid rgba(224, 224, 224, 0.6)",
                                        borderBottom: "1px solid rgba(224, 224, 224, 0.3)",
                                        bgcolor: "white",
                                        zIndex: 1,
                                    }}
                                />
                            ))}

                            {/* Блоки бронирований */}
                            {segments.map((segment, segIndex) => {
                                const booking = segment.booking;
                                const tooltipContent = booking ? (
                                    <Box>
                                        <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                                            {getBookingFullName(booking)}
                                        </Typography>
                                        <Typography variant="caption" display="block">
                                            {t('common.checkIn')}: {formatDate(booking.arrival)}
                                        </Typography>
                                        <Typography variant="caption" display="block">
                                            {t('common.checkOut')}: {formatDate(booking.departure)}
                                        </Typography>
                                        <Typography variant="caption" display="block">
                                            {t('common.status')}: {booking.status}
                                        </Typography>
                                        <Typography variant="caption" display="block">
                                            {t('common.guests')}: {booking.guestsCount}
                                        </Typography>
                                        {/* <Typography variant="caption" display="block">
                                            {t('common.price')}: {formatPrice(booking.price)}
                                        </Typography> */}
                                    </Box>
                                ) : null;

                                return (
                                    <Tooltip
                                        key={segIndex}
                                        title={tooltipContent || ''}
                                        arrow
                                        placement="top"
                                    >
                                        <Box
                                            sx={{
                                                gridColumn: `${segment.startIndex + 2} / ${segment.endIndex + 3}`,
                                                gridRow: "1 / 2",
                                                alignSelf: "stretch",
                                                m: "4px 2px",
                                                borderRadius: 2,
                                                bgcolor: segment.type === "black" ? "#000000" : "#1976D2",
                                                opacity: 0.9,
                                                zIndex: 2,
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                px: 1,
                                                cursor: booking ? "pointer" : "default",
                                            }}
                                        >
                                            {booking && (
                                                <Typography
                                                    variant="caption"
                                                    sx={{
                                                        color: "white",
                                                        fontWeight: 500,
                                                        fontSize: "11px",
                                                        whiteSpace: "nowrap",
                                                        overflow: "hidden",
                                                        textOverflow: "ellipsis",
                                                        width: "100%",
                                                        textAlign: "center",
                                                    }}
                                                >
                                                    {getBookingFullName(booking)}
                                                </Typography>
                                            )}
                                        </Box>
                                    </Tooltip>
                                );
                            })}
                        </Box>
                    );
                })}
            </Box>
        </Paper>
    );
}