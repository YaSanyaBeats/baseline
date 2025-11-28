import { BusynessRow } from "@/lib/types";
import { TableContainer, Paper, Table, TableHead, TableRow, TableCell, TableBody } from "@mui/material";
import { CSSProperties } from "@mui/material/styles";

const leftStickyCellStyle: CSSProperties = {
    borderLeft: '2px solid rgba(224, 224, 224, 0.5)',
    padding: '2px',
    textAlign: 'center',
    width: '40px'
};

function getDoubleNumber(value: number) {
    if(value <= 9) {
        return '0' + value;
    }
    return value;
}

export default function BusynessCalendarTable(props: {busynessItems: BusynessRow[]}) {
    const { busynessItems } = props;

    return (
        <TableContainer component={Paper}>
            <Table sx={{ minWidth: 650 }}> 
                <TableHead>
                    <TableRow>
                        <TableCell></TableCell>
                        {Array(busynessItems[0].busyness.length)
                            .fill(null)
                            .map((_, index) => (
                                <TableCell size="small" key={index} sx={{...leftStickyCellStyle}}>{getDoubleNumber(index + 1)}</TableCell>
                            ))
                        }
                    </TableRow>
                </TableHead>
                <TableBody>
                    {busynessItems.map((busynessItem, index) => (
                        <TableRow key={index}>
                            <TableCell sx={{whiteSpace: 'nowrap'}} size="small">{busynessItem.roomName}</TableCell>
                            {busynessItem.busyness.map((item, index) => (
                                <TableCell size="small" key={index} sx={{...leftStickyCellStyle, background: item.busyness ? '#fff1f1ff' : 'white'}}></TableCell>
                            ))}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
    );
}