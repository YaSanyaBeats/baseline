import { AnalyticsResult } from "@/lib/types";
import { Box, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from "@mui/material";
import { Object, Room } from '@/lib/types';

function createData(
  name: string,
  calories: number,
  fat: number,
  carbs: number,
  protein: number,
) {
  return { name, calories, fat, carbs, protein };
}

const rows = [
  createData('Frozen yoghurt', 159, 6.0, 24, 4.0),
  createData('Ice cream sandwich', 237, 9.0, 37, 4.3),
  createData('Eclair', 262, 16.0, 24, 6.0),
  createData('Cupcake', 305, 3.7, 67, 4.3),
  createData('Gingerbread', 356, 16.0, 49, 3.9),
];

function formatDate(date: string) {
    let currentDate = new Date(date);
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
                            let startMedianDate = new Date(row.startMedianResult).getTime();
                            let startMedianDays = startMedianDate / (24 * 60 * 60 * 1000);

                            let endMedianDate = new Date(row.endMedianResult).getTime();
                            let endMedianDays = endMedianDate / (24 * 60 * 60 * 1000);

                            return (
                                <TableCell 
                                    key={index} 
                                    component="td"
                                    style={{
                                        backgroundColor: !endMedianDays ? '#FDEDED' : 'transparent'
                                    }}
                                >
                                    <Stack>
                                        <Box>{`Занятость: ${round(row.busyness * 100, 0)}`}</Box>
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