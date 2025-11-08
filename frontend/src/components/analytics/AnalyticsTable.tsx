import { AnalyticsResult, FullAnalyticsResult, RoomAnalyticsResult } from "@/lib/types";
import { Box, Collapse, CSSProperties, IconButton, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from "@mui/material";
import { Object } from '@/lib/types';
import { useObjects } from "@/providers/ObjectsProvider";
import React, { ReactElement, useState } from 'react';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import WarningIcon from '@mui/icons-material/Warning';

const leftStickyCellStyle: CSSProperties = {
    position: 'sticky',
    left: 0,
    background: 'white',
    zIndex: 3,
    borderRight: '2px solid black'
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

const renderHeader = (array: AnalyticsResult[]) => {
    const columns: ReactElement[] = [];
    for(let i = 0; i < array.length; i++) {
        columns.push(<TableCell key={i * 3} align="left" size="small" style={{ fontSize: 14, lineHeight: 1.2, top: 57, fontWeight: 'bold' }}>Заполн.</TableCell>);
        columns.push(<TableCell key={i * 3 + 1} align="left" size="small" style={{ fontSize: 14, lineHeight: 1.2, top: 57, fontWeight: 'bold' }}>Ср. цен.</TableCell>);
        columns.push(<TableCell key={i * 3 + 2} align="left" size="small" style={{ fontSize: 14, lineHeight: 1.2, top: 57, fontWeight: 'bold' }} sx={{borderRight: '1px solid #00000030'}}>Окно бр.</TableCell>);
    }
    return columns;
}

const renderResultRow = (elems: FullAnalyticsResult) => {
    const cells: ReactElement[] = [];

    elems.objectAnalytics.map((elem, index) => {
        const startMedianDate = new Date(elem.startMedianResult).getTime();
        const startMedianDays = startMedianDate;

        const endMedianDate = new Date(elem.endMedianResult).getTime();
        const endMedianDays = endMedianDate;

        const background = !endMedianDays ? '#fff1f1ff' : 'transparent';
        
        cells.push(<TableCell key={index*3} align="left" style={{background}} sx={{fontSize: 18}}>{round(elem.busyness * 100, 0)}%</TableCell>);
        cells.push(<TableCell key={index*3 + 1} align="left" style={{background}} sx={{fontSize: 18}}>{Math.round(elem.middlePrice)}฿</TableCell>);
        cells.push(
            <TableCell key={index*3 + 2} align="left" style={{background}} sx={{borderRight: '1px solid #00000030'}}>
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

const renderResultSubRow = (rooms: RoomAnalyticsResult) => {
    const cells: ReactElement[] = [];

    rooms.roomAnalytics.map((elem, index) => {
        const startMedianDate = new Date(elem.startMedianResult).getTime();
        const startMedianDays = startMedianDate;

        const endMedianDate = new Date(elem.endMedianResult).getTime();
        const endMedianDays = endMedianDate;

        const background = !endMedianDays ? '#fff1f1ff' : 'transparent';
        
        cells.push(<TableCell key={index*3} align="left" style={{background}} sx={{fontSize: 14}}>{round(elem.busyness * 100, 0)}%</TableCell>);
        cells.push(
            <TableCell key={index*3 + 1} align="left" style={{background}} sx={{fontSize: 14}}>
                <Stack direction={'row'} spacing={1}>
                    <Box>
                        {Math.round(elem.middlePrice)}฿
                    </Box>
                    <Box>
                        {elem.warning && (<WarningIcon color="error" fontSize="small"/>)}
                    </Box>
                </Stack>
            </TableCell>
        );
        cells.push(
            <TableCell key={index*3 + 2} align="left" style={{background}} sx={{borderRight: '1px solid #00000030'}}>
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

function Row(props: { filterAnalyticsData: FullAnalyticsResult, object: Object }) {
    const { filterAnalyticsData, object } = props;
    console.log(filterAnalyticsData);
    const [open, setOpen] = useState(false);

    return (
        <>
            <TableRow>
                <TableCell component="td" style={leftStickyCellStyle}>
                    <Stack direction={'row'} alignItems={'center'} spacing={1}>
                        <IconButton
                            aria-label="expand row"
                            size="small"
                            onClick={() => setOpen(!open)}
                        >
                            {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                        </IconButton>
                        {object.name}
                        {filterAnalyticsData.warning && (<WarningIcon color="error"/>)}
                    </Stack>
                </TableCell>
                {renderResultRow(filterAnalyticsData)}
            </TableRow>
            <TableRow >
                <TableCell sx={{padding: 0, width: '100%'}} colSpan={filterAnalyticsData.objectAnalytics.length * 3 + 1}>
                    <Collapse in={open} unmountOnExit>
                        <Table size={'small'} style={{borderBottom: '2px solid black', borderCollapse: 'separate', tableLayout: 'fixed'}}>
                            <TableBody>
                                {filterAnalyticsData.roomsAnalytics.map((room) => {
                                    return (
                                        <TableRow key={room.roomID} >
                                            <TableCell style={leftStickyCellStyle} sx={{width: 300}} component="td">
                                                <Stack direction={'row'} alignItems={'center'} spacing={1}>
                                                    <Box>
                                                        {room.roomName || 'Room: ' + room.roomID}
                                                    </Box>
                                                    {room.warning && (<WarningIcon color="error"/>)}
                                                </Stack>
                                                
                                            </TableCell>
                                            
                                            {renderResultSubRow(room)}
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

export default function AnalyticsTable(props: { analyticsData: FullAnalyticsResult[] }) {
    const { objects } = useObjects();
    const { analyticsData } = props;

    const filterAnalyticsData = analyticsData;

    if(!filterAnalyticsData.length) {
        return;
    }

    return (
        <TableContainer component={Paper}>
            <Table stickyHeader sx={{ tableLayout: 'fixed' }} aria-label="simple table">
                <TableHead>
                    <TableRow>
                        <TableCell style={leftStickyCellStyle} align="left" sx={{borderRight: '1px solid #00000030', width: 300}}></TableCell>
                        {filterAnalyticsData[0].objectAnalytics.map((row, index) => {
                            return (
                                <TableCell key={index} align="center" sx={{borderRight: '1px solid #00000030', width: 300}} colSpan={3}>{`${formatDate(row.firstNight)} - ${formatDate(row.lastNight)}`}</TableCell>
                            )
                        })}
                    </TableRow>
                    <TableRow>
                        <TableCell style={leftStickyCellStyle} align="left" sx={{borderRight: '1px solid #00000030'}}></TableCell>
                        {renderHeader(filterAnalyticsData[0].objectAnalytics)}
                    </TableRow>
                </TableHead>
                <TableBody>
                    {filterAnalyticsData.map((objectAnaliticData) => {
                        const objectID = objectAnaliticData.objectID;
                        const object = objects.find((object) => {
                            return object.id == objectID;
                        })

                        if(!object) {
                            return (<></>);
                        }

                        return (
                            <Row key={object.id} filterAnalyticsData={objectAnaliticData} object={object}></Row>
                        )
                    })}
                    
                </TableBody>
                
            </Table>
        </TableContainer>
    )
}