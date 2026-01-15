import { AnalyticsBooking, AnalyticsHeader, AnalyticsResponse, FullAnalyticsResult, RoomAnalyticsResult } from "@/lib/types";
import { Box, Collapse, CSSProperties, IconButton, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tooltip, Typography } from "@mui/material";
import { Object } from '@/lib/types';
import { useObjects } from "@/providers/ObjectsProvider";
import React, { ReactElement, useEffect, useState } from 'react';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import WarningIcon from '@mui/icons-material/Warning';
import BookingPopup from "./BookingPopup";
import FunctionsIcon from '@mui/icons-material/Functions';
import ArrowDropUpIcon from '@mui/icons-material/ArrowDropUp';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import BookmarkIcon from '@mui/icons-material/Bookmark';
import { useTranslation } from "@/i18n/useTranslation";

const leftStickyCellStyle: CSSProperties = {
    position: 'sticky',
    left: 0,
    background: 'white',
    zIndex: 3,
    borderRight: '2px solid black'
};

const cellStyle: CSSProperties = {
    cursor: 'pointer',
    background: 'transparent',
    transition: '.2s',
    '&:hover': {
        background: 'rgba(0, 0, 0, 0.1)'
    }
};

const warningCellStyle: CSSProperties = {
    cursor: 'pointer',
    background: '#fff1f1ff',
    transition: '.2s',
    '&:hover': {
        background: '#f5dedeff'
    }
};

const disableCellStyle: CSSProperties = {
    cursor: 'not-allowed',
    background: '#e6e6e6ff',
    transition: '.2s',
};

function formatDate(date: string) {
    const currentDate = new Date(date);
    const day = String(currentDate.getDate()).padStart(2, '0');
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const year = currentDate.getFullYear();
    
    return `${day}.${month}.${year}`;
}

function round(num: number, decimals: number) {
    return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

const renderHeader = (periods: AnalyticsHeader[], t: (key: string) => string) => {
    const columns: ReactElement[] = [];
    periods.forEach((period, i) => {
        columns.push(
            <TableCell key={i * 3} align="left" size="small" sx={{ top: 57 }}>
                <Typography variant="body2" sx={{fontWeight: 600}}>
                    {t('analytics.occupancy')}
                </Typography>
            </TableCell>
        );
        columns.push(
            <TableCell key={i * 3 + 1} align="left" size="small" style={{ fontSize: 14, lineHeight: 1.2, top: 57, fontWeight: 'bold' }}>
                <Typography variant="body2" sx={{fontWeight: 600}}>
                    {t('analytics.avgPrice')}
                </Typography>
            </TableCell>
        );
        columns.push(<TableCell key={i * 3 + 2} align="left" size="small" style={{ fontSize: 14, lineHeight: 1.2, top: 57, fontWeight: 'bold' }} sx={{borderRight: '1px solid #00000030'}}>{t('analytics.bookingWindow')}</TableCell>);
    })
    return columns;
}

const renderAverageHeader = (periods: AnalyticsHeader[]) => {
    const columns: ReactElement[] = [];
    periods.forEach((period, i) => {
        columns.push(
            <TableCell key={i * 3} align="left" size="small" sx={{ background: '#F0F0F0', zIndex: 1 }}>
                <Typography variant="body1" sx={{fontWeight: 600 }}>
                    {round(period.middleBusyness * 100, 0)}%
                </Typography>
            </TableCell>
        );
        columns.push(
            <TableCell key={i * 3 + 1} align="left" size="small" sx={{ background: '#F0F0F0', zIndex: 1 }}>
                <Typography variant="body1" sx={{fontWeight: 600 }}>
                    {Math.round(period.middlePrice)}฿
                </Typography>
            </TableCell>
        );
        columns.push(<TableCell key={i * 3 + 2} align="left" size="small" sx={{borderRight: '1px solid #00000030', background: '#F0F0F0', zIndex: 1}}></TableCell>);
    })
    return columns;
}

const renderResultRow = (elems: FullAnalyticsResult, handleClick: (booking: AnalyticsBooking[]) => void, t: (key: string) => string) => {
    const cells: ReactElement[] = [];


    elems.objectAnalytics.map((elem, index) => {
        const startMedianDate = new Date(elem.startMedianResult).getTime();
        const startMedianDays = startMedianDate;

        const endMedianDate = new Date(elem.endMedianResult).getTime();
        const endMedianDays = endMedianDate;

        const cellStyles = elem.disable ? disableCellStyle : (!endMedianDays ? warningCellStyle : cellStyle);
        
        cells.push(
            <TableCell 
                onClick={handleClick.bind(this, elem.bookings)} 
                key={index*3} 
                align="left" 
                sx={{fontSize: 18, ...cellStyles}}
            >
                <Stack direction={'row'} alignItems={'start'}>
                    <Box>
                        {round(elem.busyness * 100, 0)}%
                    </Box>
                    <Box>
                        <Tooltip title={t('analytics.compareWithAverage')}>
                            {elem.busynessGrow ? (<ArrowDropUpIcon color={'success'}></ArrowDropUpIcon>) : (<ArrowDropDownIcon color={'error'}></ArrowDropDownIcon>)}
                        </Tooltip>
                    </Box>
                </Stack>
                
            </TableCell>
        );
        cells.push(
            <TableCell 
                onClick={handleClick.bind(this, elem.bookings)} 
                key={index*3 + 1}
                align="left"
                sx={{fontSize: 18, ...cellStyles}}
            >
                <Stack direction={'row'}>
                    <Box>
                        {Math.round(elem.middlePrice)}฿
                    </Box>
                    <Box mt={'2px'} ml={'2px'}>
                        {elem.error && (<WarningIcon color="error" fontSize="small"/>)}
                        {elem.warning && (<WarningIcon sx={{color: "#EDB802"}} fontSize="small"/>)}
                    </Box>
                    <Box>
                        <Tooltip title={t('analytics.compareWithAverage')}>
                            {elem.priceGrow ? (<ArrowDropUpIcon color={'success'}></ArrowDropUpIcon>) : (<ArrowDropDownIcon color={'error'}></ArrowDropDownIcon>)}
                        </Tooltip>
                    </Box>
                </Stack>
            </TableCell>
        );
        cells.push(
            <TableCell 
                onClick={handleClick.bind(this, elem.bookings)} 
                key={index*3 + 2} 
                align="left" 
                sx={{borderRight: '1px solid #00000030', ...cellStyles}}
            >
                <Stack direction={'row'} spacing={1} style={{fontSize: 16}}>
                    <Box>{startMedianDays ? round(startMedianDays, 0) : '~'}</Box>
                    <Box>-</Box>
                    <Box>{endMedianDays ? round(endMedianDays, 0) : '~'}</Box>
                </Stack>
            </TableCell>
        );
    })
    return cells;
}

const renderResultSubRow = (rooms: RoomAnalyticsResult, handleClick: (booking: AnalyticsBooking[]) => void) => {
    const cells: ReactElement[] = [];

    rooms.roomAnalytics.map((elem, index) => {
        const startMedianDate = new Date(elem.startMedianResult).getTime();
        const startMedianDays = startMedianDate;

        const endMedianDate = new Date(elem.endMedianResult).getTime();
        const endMedianDays = endMedianDate;

        const cellStyles = elem.disable ? disableCellStyle : (!endMedianDays ? warningCellStyle : cellStyle);
        
        cells.push(
            <TableCell 
                onClick={handleClick.bind(this, elem.bookings)} 
                key={index*3} 
                align="left" 
                sx={{fontSize: 14, ...cellStyles}}
            >
                {round(elem.busyness * 100, 0)}%
            </TableCell>
        );
        cells.push(
            <TableCell 
                onClick={handleClick.bind(this, elem.bookings)}  
                key={index*3 + 1} 
                align="left" 
                sx={{fontSize: 14, ...cellStyles}}
            >
                <Stack direction={'row'} spacing={1}>
                    <Box>
                        {Math.round(elem.middlePrice)}฿
                    </Box>
                    <Stack direction={'row'}>
                        {elem.error && (<WarningIcon color="error" fontSize="small"/>)}
                        {elem.warning && (<WarningIcon sx={{color: "#EDB802"}} fontSize="small"/>)}
                    </Stack>
                </Stack>
            </TableCell>
        );
        cells.push(
            <TableCell
                onClick={handleClick.bind(this, elem.bookings)} 
                key={index*3 + 2} 
                align="left" 
                sx={{borderRight: '1px solid #00000030', ...cellStyles}}
            >
                <Stack direction={'row'} spacing={1} style={{fontSize: 14}}>
                    <Box>{startMedianDays ? round(startMedianDays, 0) : '~'}</Box>
                    <Box>-</Box>
                    <Box>{endMedianDays ? round(endMedianDays, 0) : '~'}</Box>
                </Stack>
            </TableCell>
        );
    })
    return cells;
}

function Row(props: { filterAnalyticsData: FullAnalyticsResult, object: Object, handleClick: (booking: AnalyticsBooking[]) => void, t: (key: string) => string }) {
    const { filterAnalyticsData, object, handleClick, t } = props;
    const [openCollapse, setOpenCollapse] = useState(false);

    return (
        <>
            <TableRow>
                <TableCell component="td" style={leftStickyCellStyle} sx={{width: 300}}>
                    <Stack direction={'row'} alignItems={'center'} spacing={1}>
                        <IconButton
                            size="small"
                            onClick={() => setOpenCollapse(!openCollapse)}
                        >
                            {openCollapse ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                        </IconButton>
                        {object.name}
                        {filterAnalyticsData.error && (<WarningIcon color="error"/>)}
                        {filterAnalyticsData.warning && (<WarningIcon sx={{color: "#EDB802"}}/>)}
                    </Stack>
                </TableCell>
                {renderResultRow(filterAnalyticsData, handleClick, t)}
            </TableRow>
            <TableRow >
                <TableCell sx={{padding: 0, width: '100%'}} colSpan={filterAnalyticsData.objectAnalytics.length * 3 + 1}>
                    <Collapse in={openCollapse} unmountOnExit>
                        <Table size={'small'} style={{borderBottom: '2px solid black', borderCollapse: 'separate', tableLayout: 'fixed'}}>
                            <TableBody>
                                <TableRow>
                                    <TableCell sx={{width: 300, padding: 0, border: 'none'}} />
                                    {Array.from({ length: filterAnalyticsData.roomsAnalytics[0].roomAnalytics.length }, (_, index) => (
                                        <TableCell key={index} colSpan={3} sx={{width: 300, padding: 0, border: 'none'}} />
                                    ))}
                                </TableRow>
                                {filterAnalyticsData.roomsAnalytics.map((room) => {
                                    return (
                                        <TableRow key={room.roomID} >
                                            <TableCell style={leftStickyCellStyle} sx={{width: 300}} component="td">
                                                <Stack direction={'row'} alignItems={'center'} spacing={1}>
                                                    <Box>
                                                        {room.roomName || 'Room: ' + room.roomID}
                                                    </Box>
                                                    {room.error && (<WarningIcon color="error"/>)}
                                                    {room.warning && (<WarningIcon sx={{color: "#EDB802"}}/>)}
                                                </Stack>
                                                
                                            </TableCell>
                                            
                                            {renderResultSubRow(room, handleClick)}
                                        </TableRow>
                                    )
                                })}
                                
                            </TableBody>
                        </Table>
                    </Collapse>
                </TableCell>
            </TableRow>
        </>
    )
}

export default function AnalyticsTable(props: { analyticsData: AnalyticsResponse }) {
    const { t } = useTranslation();
    const [openBookingsPopup, setOpenBookingsPopup] = React.useState(false);
    const [selectedBookings, setSelectedBookings] = React.useState<AnalyticsBooking[]>([]);

    const { analyticsData } = props;
    const [filterAnalyticsData, setFilterAnalyticsData] = React.useState<AnalyticsResponse>(analyticsData);
    const [isCompare, setIsCompare] = React.useState(false);

    const { objects } = useObjects();
    const handleCellClick = (bookings: AnalyticsBooking[]) => {
        setSelectedBookings(bookings);
        setOpenBookingsPopup(true);
    }

    useEffect(() => {
        setFilterAnalyticsData(analyticsData);
        setIsCompare(false);
    }, [analyticsData])

    if(!filterAnalyticsData.data?.length) {
        return;
    }

    const handleCompareChange = (firstNight: string) => {
        if(isCompare) {
            setFilterAnalyticsData(analyticsData);
            setIsCompare(false);
            return;
        }

        const neededDate = firstNight.split(/[-T]/).slice(1, 3).join('-');
        const newData: AnalyticsResponse = {
            ...analyticsData,
            data: analyticsData.data.map(object => {
                return {
                    ...object,
                    objectAnalytics: object.objectAnalytics.filter(objectAnalyticsItem => {
                        return objectAnalyticsItem.firstNight.split('T')[0].includes(neededDate);
                    }),
                    roomsAnalytics: object.roomsAnalytics.map((room) => {
                        return {
                            ...room,
                            roomAnalytics: room.roomAnalytics.filter(roomAnalyticsItem => {
                                return roomAnalyticsItem.firstNight.split('T')[0].includes(neededDate);
                            })
                        }
                    })
                }
            }),
            header: analyticsData.header.filter(headerItem => {
                return headerItem.firstNight.split('T')[0].includes(neededDate);
            })
        };

        setFilterAnalyticsData(newData);
        setIsCompare(true);
    }

    return (
        <>
            <TableContainer component={Paper} sx={{ maxHeight: '70vh', paddingBottom: '8px' }}>
                <Table stickyHeader sx={{ tableLayout: 'fixed' }}>
                    <TableHead>
                        <TableRow>
                            <TableCell style={leftStickyCellStyle} align="left" sx={{borderRight: '1px solid #00000030', width: 300}}></TableCell>
                            {filterAnalyticsData.header.map((row, index) => {
                                return (
                                    <TableCell key={index} align="center" sx={{borderRight: '1px solid #00000030', width: 300}} colSpan={3}>
                                        <Stack ml={4} direction={'row'} alignItems={'center'} justifyContent={'center'} spacing={1}>
                                            <Box>
                                                {`${formatDate(row.firstNight)} - ${formatDate(row.lastNight)}`}
                                            </Box>
                                            <Box>
                                                <IconButton onClick={handleCompareChange.bind(null, row.firstNight)}>
                                                    {isCompare ? <BookmarkIcon color="primary"/> : <BookmarkBorderIcon color="primary"/>}
                                                </IconButton>
                                            </Box>
                                        </Stack>
                                    </TableCell>
                                )
                            })}
                        </TableRow>
                        <TableRow>
                            <TableCell style={leftStickyCellStyle} align="left" sx={{borderRight: '1px solid #00000030'}}></TableCell>
                            {renderHeader(filterAnalyticsData.header, t)}
                        </TableRow>
                        <TableRow>
                            <TableCell style={leftStickyCellStyle} align="left" sx={{borderRight: '1px solid #00000030'}}>
                                <Stack direction={'row'} spacing={1}>
                                    <FunctionsIcon></FunctionsIcon>
                                    <Typography sx={{fontWeight: 600}}>{t('analytics.averageBySample')}</Typography>
                                </Stack>
                            </TableCell>
                            {renderAverageHeader(filterAnalyticsData.header)}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {filterAnalyticsData.data.map((objectAnaliticData) => {
                            const objectID = objectAnaliticData.objectID;
                            const object = objects.find((object) => {
                                return object.id == objectID;
                            })

                            if(!object) {
                                return (<></>);
                            }

                            return (
                                <Row key={object.id} filterAnalyticsData={objectAnaliticData} object={object} handleClick={handleCellClick} t={t}></Row>
                            )
                        })}
                        
                    </TableBody>
                </Table>
            </TableContainer>
            <BookingPopup open={openBookingsPopup} bookings={selectedBookings} onClose={() => setOpenBookingsPopup(false)} />
        </>
    )
}