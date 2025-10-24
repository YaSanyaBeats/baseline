import { AnalyticsResult, FullAnalyticsResult } from "@/lib/types";
import { Box, Collapse, IconButton, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from "@mui/material";
import { Object } from '@/lib/types';
import { useObjects } from "@/providers/ObjectsProvider";
import React, { ReactElement, useState } from 'react';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';

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
        columns.push(<TableCell key={i * 3} align="left" sx={{borderLeft: '1px solid #00000030'}}>Заполняемость</TableCell>);
        columns.push(<TableCell key={i * 3 + 1} align="left">Средняя цена</TableCell>);
        columns.push(<TableCell key={i * 3 + 2} align="left">Окно бронирования</TableCell>);
    }
    return columns;
}

const renderResultSubRow = (elems: FullAnalyticsResult) => {
    const cells: ReactElement[] = [];

    elems.all.map((elem, index) => {
        const startMedianDate = new Date(elem.startMedianResult).getTime();
        const startMedianDays = startMedianDate / (24 * 60 * 60 * 1000);

        const endMedianDate = new Date(elem.endMedianResult).getTime();
        const endMedianDays = endMedianDate / (24 * 60 * 60 * 1000);
        const background = !endMedianDays ? '#fff1f1ff' : 'transparent';
        
        cells.push(<TableCell key={index*3} align="left" style={{background}} sx={{borderLeft: '1px solid #00000030', width: 150}}>{round(elem.busyness * 100, 0)}%</TableCell>);
        cells.push(<TableCell key={index*3 + 1} align="left" style={{background}} sx={{width: 150}}>Средняя цена</TableCell>);
        cells.push(
            <TableCell key={index*3 + 2} align="left" style={{background}} sx={{width: 150}}>
                <Stack direction={'row'} spacing={1} style={{fontSize: 24}}>
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
    const [open, setOpen] = useState(false);
    return (
        <>
            <TableRow
                 sx={{ '&:last-child td, &:last-child th': { border: 0 } }}
            >
                <TableCell component="td" sx={{width: 150}}>
                    <Stack direction={'row'} alignItems={'center'} sx={{width: 150}}>
                        <IconButton
                            aria-label="expand row"
                            size="small"
                            onClick={() => setOpen(!open)}
                        >
                            {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                        </IconButton>
                        {object.name}
                    </Stack>
                </TableCell>
                {renderResultSubRow(filterAnalyticsData)}
            </TableRow>
            <TableRow sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                <TableCell colSpan={175} sx={{padding: 0}}>
                    <Collapse in={open} timeout="auto" unmountOnExit>
                        <Table>
                            <TableBody>
                                {object.roomTypes.map((room) => {
                                    return (
                                        <TableRow key={room.id} sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                                            <TableCell component="td" sx={{width: 150}}>
                                                <Box sx={{width: 150}}>
                                                    {room.name || room.id}
                                                </Box>
                                                
                                            </TableCell>
                                            
                                            {renderResultSubRow(filterAnalyticsData)}
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
    const { objects, loading, error, refreshObjects } = useObjects();
    
    const { analyticsData } = props;

    // let maxObject: AnalyticsResult[] = [];

    const filterAnalyticsData = analyticsData;//.filter((elem) => {return elem.length})

    // filterAnalyticsData.forEach((analyticsObjectData) => {
    //     if(analyticsObjectData.length > maxObject.length) {
    //         maxObject = analyticsObjectData.slice();
    //     }
    // })
    
    // maxObject = maxObject.map((elem) => {
    //     const currentRow = elem;
    //     if(currentRow) {
    //         currentRow.bookings = [];
    //         currentRow.busyness = 0;
    //         currentRow.startMedianResult = '';
    //         currentRow.endMedianResult  = '';
    //     }
        
    //     return currentRow;
    // });

    
    // filterAnalyticsData.forEach((analyticsObjectData, index) => {
    //     const object = objects.find((object) => {
    //         return object.id == analyticsObjectData[0].id;
    //     })
        
    //     if(!object) {
    //         return;
    //     }
    //     const currentData = JSON.parse(JSON.stringify(maxObject)) as AnalyticsResult[];
    //     currentData.forEach((row, currIndex) => {
    //         currentData[currIndex].id = object.id;
    //     })
    //     currentData.forEach((row, currIndex) => {
    //         const index = analyticsObjectData.findIndex((dataRow) => {
    //             return dataRow.firstNight === row.firstNight;
    //         })
    //         if(analyticsObjectData[index]) {
    //             currentData[currIndex] = analyticsObjectData[index];
    //         }
            
    //     })
    //     filterAnalyticsData[index] = currentData;
    // })

    if(!filterAnalyticsData.length) {
        return;
    }

    return (
        <Box>
            <Stack spacing={2} sx={{ overflow: 'hidden' }}>
                <TableContainer component={Paper} sx={{ maxHeight: '70vh', maxWidth: '80vw' }}>
                    <Table stickyHeader sx={{ minWidth: 650 }} aria-label="simple table">
                        <TableHead>
                            <TableRow>
                                <TableCell align="left"></TableCell>
                                {filterAnalyticsData[0].all.map((row, index) => {
                                    return (
                                        <TableCell key={index} align="center" colSpan={3}>{`${formatDate(row.firstNight)} - ${formatDate(row.lastNight)}`}</TableCell>
                                    )
                                })}
                            </TableRow>
                            <TableRow>
                                <TableCell align="left"></TableCell>
                                {renderHeader(filterAnalyticsData[0].all)}
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {filterAnalyticsData.map((objectAnaliticData) => {
                                const objectID = objectAnaliticData.all[0]?.id;
                                const object = objects.find((object) => {
                                    return object.id == objectID;
                                })

                                if(!object) {
                                    return (<></>);
                                }

                                return (
                                    <Row key={object.id + Math.random()} filterAnalyticsData={objectAnaliticData} object={object}></Row>
                                )
                            })}
                            
                        </TableBody>
                        
                    </Table>
                </TableContainer>
            </Stack>
        </Box>
    )
}