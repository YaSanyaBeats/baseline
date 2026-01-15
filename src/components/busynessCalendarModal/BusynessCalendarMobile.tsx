import { BusynessRow, BusynessBookingInfo, BusynessItem } from "@/lib/types";
import { Box, Paper, Typography } from "@mui/material";
import { useState } from "react";
import BookingInfoModal from "./BookingInfoModal";
import { useTranslation } from "@/i18n/useTranslation";

function getDoubleNumber(value: number) {
    if (value <= 9) {
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

const getSegments = (busyness: BusynessItem[]): Segment[] => {
    const segments: Segment[] = [];
    let current: Segment | null = null;

    busyness.forEach((item, index) => {
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
        } else if (
            current.type === item.busyness &&
            (
                (!current.booking && !item.booking) ||
                (current.booking && item.booking && current.booking.id === item.booking.id)
            )
        ) {
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

type WeekSegment = Segment & {
    isStart: boolean;
    isEnd: boolean;
};

const getWeekdayShort = (dateString: string, t: (key: string) => string) => {
    const date = new Date(dateString);
    const day = date.getDay(); // 0 - Sunday
    const map = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    return t(`calendar.weekdays.mobile.${map[day]}`);
};

const segmentColors: Record<SegmentType, string> = {
    busyness: "#1976D2", // бирюзовый, как на примере
    black: "#333333",    // розовый для закрытых дат
};

export default function BusynessCalendarMobile(props: { busynessItems: BusynessRow[] }) {
    const { busynessItems } = props;
    const { t } = useTranslation();
    const [selectedBooking, setSelectedBooking] = useState<BusynessBookingInfo | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const handleBookingClick = (booking: BusynessBookingInfo | null) => {
        if (booking) {
            setSelectedBooking(booking);
            setIsModalOpen(true);
        }
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setSelectedBooking(null);
    };

    if (!busynessItems.length || !busynessItems[0].busyness.length) {
        return null;
    }

    return (
        <>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {busynessItems.map((row, rowIndex) => {
                const oridinalDays = row.busyness;
                const firstDayDate = new Date(oridinalDays[0].date);
                const currentMonth = firstDayDate.getMonth() + 1;

                const daysBeforeMonday = firstDayDate.getDay() === 0 ? 6 : firstDayDate.getDay() - 1;
                const emptyDays = [];
                for (let i = 0; i < daysBeforeMonday; i++) {
                    firstDayDate.setDate(firstDayDate.getDate() - 1);
                    emptyDays.unshift({
                        date: firstDayDate.toISOString().split('T')[0],
                        busyness: 'free',
                        bookng: null,
                    } as BusynessItem);
                }
                
                const days = [...emptyDays, ...row.busyness];
                const daysCount = days.length;
                console.log(currentMonth);

                // Ограничиваем отображение блоков текущим месяцем (по первой дате ряда)
                /*const firstDate = new Date(days[0].date);
                const targetMonth = firstDate.getMonth();
                const targetYear = firstDate.getFullYear();

                const monthMask = days.map((day) => {
                    const d = new Date(day.date);
                    return d.getMonth() === targetMonth && d.getFullYear() === targetYear;
                });

                const visibleStart = monthMask.findIndex(Boolean);
                const visibleEnd = monthMask.lastIndexOf(true);
                

                const segments =
                    visibleStart === -1 || visibleEnd === -1
                        ? []
                        : getSegments(row, visibleStart, visibleEnd);*/

                const segments = getSegments(days);

                // const occupiedDays = days.filter(day => day.busyness !== 'free').length;
                // const occupancy = Math.round((occupiedDays / days.length) * 100);

                const weeksCount = Math.ceil(daysCount / 7);

                // Для переноса блоков на новую строку: разбиваем сегменты по неделям
                const segmentsByWeek: WeekSegment[][] = Array.from({ length: weeksCount }, () => []);

                segments.forEach(segment => {
                    for (let weekIndex = 0; weekIndex < weeksCount; weekIndex++) {
                        const weekStart = weekIndex * 7;
                        const weekEnd = Math.min(weekStart + 6, daysCount - 1);

                        const intersectStart = Math.max(segment.startIndex, weekStart);
                        const intersectEnd = Math.min(segment.endIndex, weekEnd);

                        if (intersectStart <= intersectEnd) {
                            segmentsByWeek[weekIndex].push({
                                startIndex: intersectStart - weekStart,
                                endIndex: intersectEnd - weekStart,
                                type: segment.type,
                                booking: segment.booking,
                                isStart: intersectStart === segment.startIndex,
                                isEnd: intersectEnd === segment.endIndex,
                            });
                        }
                    }
                });

                return (
                    <Paper
                        key={rowIndex}
                        sx={{
                            p: 2,
                            borderRadius: 2,
                            boxShadow: 1,
                        }}
                    >
                        {/* Заголовок комнаты */}
                        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                            {row.roomName}
                        </Typography>

                        {/* Календарь: строки = недели, столбцы = дни, блоки переносятся на новую строку */}
                        <Box sx={{ mt: 1 }}>
                            <Box sx={{ width: "100%" }}>
                                {Array.from({ length: weeksCount }).map((_, weekIndex) => {
                                    const weekStart = weekIndex * 7;
                                    const weekDays = days.slice(weekStart, weekStart + 7);
                                    const weekSegments = segmentsByWeek[weekIndex];
                                    return (
                                        <Box
                                            key={weekIndex}
                                            sx={{
                                                position: "relative",
                                            }}
                                        >
                                            {/* Блоки бронирований (подсветка, как на примере) */}
                                            <Box
                                                sx={{
                                                    position: "absolute",
                                                    inset: 0,
                                                    display: "grid",
                                                    gridTemplateColumns: `40px repeat(6, minmax(0, 1fr))`,
                                                    columnGap: 0.5,
                                                    alignItems: "stretch",
                                                    pointerEvents: "none",
                                                    zIndex: 3,
                                                }}
                                            >
                                                {weekSegments.map((segment, segIndex) => (
                                                    <Box
                                                        key={segIndex}
                                                        onClick={() => handleBookingClick(segment.booking)}
                                                        sx={{
                                                            gridColumn: `${segment.startIndex + 1} / ${segment.endIndex + 2}`,
                                                            alignSelf: "stretch",
                                                            // Размещаем блок заметно ниже даты
                                                            mt: "46px",
                                                            mx: 0,
                                                            borderRadius: segment.isStart && segment.isEnd
                                                                ? 10
                                                                : segment.isStart
                                                                    ? "10px 0 0 10px"
                                                                    : segment.isEnd
                                                                        ? "0 10px 10px 0"
                                                                        : 0,
                                                            bgcolor: segmentColors[segment.type],
                                                            opacity: 0.95,
                                                            minHeight: 20,
                                                            display: "flex",
                                                            alignItems: "center",
                                                            justifyContent: "center",
                                                            px: 0.5,
                                                            height: '38px',
                                                            pointerEvents: segment.booking ? "auto" : "none",
                                                            cursor: segment.booking ? 'pointer' : 'default',
                                                            '&:hover': segment.booking ? {
                                                                opacity: 1,
                                                                transform: 'scale(1.02)',
                                                                transition: 'all 0.2s ease-in-out'
                                                            } : {}
                                                        }}
                                                    >
                                                        {segment.booking && (
                                                            <Typography
                                                                variant="caption"
                                                                sx={{
                                                                    color: "#FFFFFF",
                                                                    fontSize: 10,
                                                                    fontWeight: 500,
                                                                    whiteSpace: "nowrap",
                                                                    overflow: "hidden",
                                                                    textOverflow: "ellipsis",
                                                                    width: "100%",
                                                                    textAlign: "center",
                                                                }}
                                                            >
                                                                {getBookingFullName(segment.booking)}
                                                            </Typography>
                                                        )}
                                                    </Box>
                                                ))}
                                            </Box>

                                            {/* Сетка дней недели и дат поверх подсветки */}
                                            <Box
                                                sx={{
                                                    position: "relative",
                                                    display: "grid",
                                                    gridTemplateColumns: `40px repeat(6, minmax(0, 1fr))`,
                                                    columnGap: 0,
                                                    zIndex: 2,
                                                }}
                                            >
                                                {weekDays.map((day, index) => (
                                                    <Box
                                                        key={index}
                                                        sx={{
                                                            height: '92px',
                                                            borderRadius: 0,
                                                            // фон прозрачный, чтобы был виден цвет блока
                                                            bgcolor: "transparent",
                                                            border: "1px solid rgba(224, 224, 224, 0.8)",
                                                            display: "flex",
                                                            flexDirection: "column",
                                                            alignItems: "center",
                                                            fontSize: 11,
                                                            pt: 1,
                                                            background: +day.date.split('-')[1] == currentMonth ? 'white' : '#cccccc'
                                                        }}
                                                    >
                                                        <Box sx={{ 
                                                                fontSize: 10, 
                                                                color: "text.secondary",
                                                            }}>
                                                            {getWeekdayShort(day.date, t)}
                                                        </Box>
                                                        <Box>
                                                            {getDoubleNumber(new Date(day.date).getDate())}
                                                        </Box>
                                                    </Box>
                                                ))}
                                            </Box>
                                        </Box>
                                    );
                                })}
                            </Box>
                        </Box>

                        {/* Occupancy */}
                        {/* <Box sx={{ mt: 1.5 }}>
                            <Typography variant="caption" sx={{ color: "text.secondary" }}>
                                Occupancy: {isNaN(occupancy) ? 0 : occupancy}%
                            </Typography>
                        </Box> */}
                    </Paper>
                );
            })}
        </Box>
            <BookingInfoModal
                open={isModalOpen}
                booking={selectedBooking}
                onClose={handleCloseModal}
            />
        </>
    );
}


