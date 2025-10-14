import { AnalyticsResult } from "@/lib/types";
import { Box, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from "@mui/material";
import { Object } from '@/lib/types';
import { useObjects } from "@/providers/ObjectsProvider";

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

export default function AnalyticsTable(props: { analyticsData: AnalyticsResult[][] }) {
    const { objects, loading, error, refreshObjects } = useObjects();
    
    const { analyticsData } = props;

    let maxObject: AnalyticsResult[] = [];

    const filterAnalyticsData = analyticsData.filter((elem) => {return elem.length})

    filterAnalyticsData.forEach((analyticsObjectData) => {
        if(analyticsObjectData.length > maxObject.length) {
            maxObject = analyticsObjectData.slice();
        }
    })

    maxObject = maxObject.map((elem) => {
        const currentRow = elem;
        if(currentRow) {
            currentRow.bookings = [];
            currentRow.busyness = 0;
            currentRow.startMedianResult = '';
            currentRow.endMedianResult  = '';
        }
        
        return currentRow;
    });

    console.log('old', filterAnalyticsData);
    filterAnalyticsData.forEach((analyticsObjectData, index) => {
        const object = objects.find((object) => {
            return object.id == analyticsObjectData[0].id;
        })
        
        
        if(!object) {
            return;
        }
        const currentData = maxObject.slice();
        currentData.forEach((row, currIndex) => {
            const index = analyticsObjectData.findIndex((dataRow) => {
                return dataRow.firstNight === row.firstNight;
            })
            if(analyticsObjectData[index]) {
                currentData[currIndex] = analyticsObjectData[index];
                currentData[currIndex].id = object.id;
            }
            else {
                currentData[currIndex].id = object.id;
            }
            
        })
        filterAnalyticsData[index] = currentData;
    })
    console.log('new', filterAnalyticsData);
    

    return (
        <Box>
            <Stack spacing={2}>
                <TableContainer component={Paper}>
                    <Table sx={{ minWidth: 650 }} aria-label="simple table">
                        <TableHead>
                        <TableRow>
                            <TableCell align="left"></TableCell>
                            {maxObject.map((row, index) => {
                                return (
                                    <TableCell key={index} align="left">{`${formatDate(row.firstNight)} - ${formatDate(row.lastNight)}`}</TableCell>
                                )
                            })}
                        </TableRow>
                        </TableHead>
                        <TableBody>
                            {filterAnalyticsData.map((objectAnaliticData) => {
                                const objectID = objectAnaliticData[0]?.id;
                                const object = objects.find((object) => {
                                    return object.id == objectID;
                                })

                                if(!object) {
                                    return;
                                }
                                
                                return (
                                    <TableRow
                                        key={object.id + Math.random()} sx={{ '&:last-child td, &:last-child th': { border: 0 } }}
                                    >
                                        <TableCell component="td">{object.name}</TableCell>
                                        {objectAnaliticData.map((row, index) => {
                                            
                                            const startMedianDate = new Date(row.startMedianResult).getTime();
                                            const startMedianDays = startMedianDate / (24 * 60 * 60 * 1000);

                                            const endMedianDate = new Date(row.endMedianResult).getTime();
                                            const endMedianDays = endMedianDate / (24 * 60 * 60 * 1000);

                                            return (
                                                <TableCell 
                                                    key={index} 
                                                    component="td"
                                                    style={{
                                                        backgroundColor: !endMedianDays ? '#FDEDED' : 'transparent'
                                                    }}
                                                >
                                                    <Stack>
                                                        <Box>Занятость: {round(row.busyness * 100, 0)}%</Box>
                                                        <Box>
                                                            Окно бронирования:
                                                            <Stack direction={'row'} spacing={1} style={{fontSize: 24}}>
                                                                <Box>{startMedianDays ? round(startMedianDays, 0) : '~'}</Box>
                                                                <Box>-</Box>
                                                                <Box>{endMedianDays ? round(endMedianDays, 0) : '~'}</Box>
                                                            </Stack>
                                                        </Box>
                                                    </Stack>
                                                </TableCell>
                                            )
                                        })}
                                    </TableRow>
                                    )
                            })}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Stack>
        </Box>
    )
}