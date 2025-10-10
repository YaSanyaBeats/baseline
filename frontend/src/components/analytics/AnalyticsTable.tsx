import { AnalyticsResult } from "@/lib/types";
import { Box, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from "@mui/material";
import { Object } from '@/lib/types';

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

export default function AnalyticsTable(props: { analyticsData: AnalyticsResult[], object: Object }) {
    const { analyticsData, object } = props;
    
    return (
        <Stack spacing={2}>
            <Box>{object.name}</Box>
            <TableContainer component={Paper}>
                <Table sx={{ minWidth: 650 }} aria-label="simple table">
                    <TableHead>
                    <TableRow>
                        {analyticsData.map((row, index) => {
                            return (
                                <TableCell key={index} align="left">{`${formatDate(row.firstNight)} - ${formatDate(row.lastNight)}`}</TableCell>
                            )
                        })}
                    </TableRow>
                    </TableHead>
                    <TableBody>
                    <TableRow
                        sx={{ '&:last-child td, &:last-child th': { border: 0 } }}
                    >
                        {analyticsData.map((row, index) => {
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
                    </TableBody>
                </Table>
            </TableContainer>
        </Stack>
    )
}