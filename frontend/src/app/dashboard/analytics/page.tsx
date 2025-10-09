'use client'

import AnalyticsTable from "@/components/analytics/AnalyticsTable";
import { getAnalytics } from "@/lib/beds24/getAnalytics";
import { getObjects } from "@/lib/beds24/objects";
import { AnalyticsFilterData, AnalyticsResult, Object, Room } from "@/lib/types";
import { Analytics } from "@mui/icons-material";
import { Box, Button, Checkbox, Chip, FormControl, InputLabel, ListItemText, MenuItem, OutlinedInput, Select, Skeleton, Stack, TextField } from "@mui/material"
import React from "react";


const ITEM_HEIGHT = 48;
const ITEM_PADDING_TOP = 8;
const MenuProps = {
  PaperProps: {
    style: {
      maxHeight: ITEM_HEIGHT * 4.5 + ITEM_PADDING_TOP,
      width: 250,
    },
  },
};

function checkNumber(value: unknown): value is number {
    return typeof value === 'number';
}

export default function Page() {
    const [objects, setObjects] = React.useState<Object[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [analyticsData, setAnalyticsData] = React.useState<AnalyticsResult[]>([]);

    const [filterData, setFilterData] = React.useState<AnalyticsFilterData>({
        objects: [],
        startMedian: 20,
        endMedian: 70
    });

    React.useEffect(() => {
        const fetchObjects = async () => {
            try {
                setLoading(true);
                const obj = await getObjects();
                console.log(obj);
                if(Array.isArray(obj)) {
                    setObjects(obj);
                }
            } finally {
                setLoading(false); 
            }
        };

        fetchObjects();
            
    }, [])

    const handleObjectChange = (event: { target: { value: string[]; }; }) => {
        const value = event.target.value;
        
        const selectedObjects = value.map((obj: string) => {
            return objects.find((a) => {
                return a.name === obj;
            });
        }).flatMap(obj => obj ?? []);

        if(selectedObjects === undefined) {
            return;
        }

        setFilterData({
            ...filterData,
            objects: selectedObjects,
        });
    }

    const handleSubmit = async () => {
        const currentAnalyticsData = await getAnalytics(filterData);
        setAnalyticsData(currentAnalyticsData);
    }

    const handleChangeStartMedian = (event: React.ChangeEvent<HTMLInputElement>) => {
        if(!checkNumber(event?.target?.value)) {
            return;
        }

        setFilterData({
            ...filterData,
            startMedian: event.target.value
        });
    }

    const handleChangeEndMedian = (event: React.ChangeEvent<HTMLInputElement>) => {
        if(!checkNumber(event?.target?.value)) {
            return;
        }

        setFilterData({
            ...filterData,
            endMedian: event.target.value
        });
    }

    if (loading) return (
        <Stack spacing={1}>
            <Skeleton variant="rounded" width={'100%'} height={50} />
            <Skeleton variant="rounded" width={'100%'} height={50} />
            <Skeleton variant="rounded" width={'100%'} height={50} />
            <Skeleton variant="rounded" width={'100%'} height={50} />
            <Skeleton variant="rounded" width={'100%'} height={50} />
            <Skeleton variant="rounded" width={'100%'} height={50} />
            <Skeleton variant="rounded" width={'100%'} height={50} />
            <Skeleton variant="rounded" width={'100%'} height={50} />
        </Stack>
    )

    
    return (
        <Stack spacing={4}>
            <Stack direction={'row'} alignItems={"center"} spacing={1}>
                <Box>Получить аналитику для:</Box>
                <FormControl sx={{ m: 1, width: 300 }}>
                    <InputLabel id="objects-select">Выберите объект</InputLabel>
                    <Select
                        labelId="objects-select"
                        id="demo-multiple-checkbox"
                        multiple
                        value={filterData.objects.map((obj) => {return obj.name})}
                        onChange={handleObjectChange}
                        input={<OutlinedInput label="Выберите объект" />}
                        MenuProps={MenuProps}
                        renderValue={(selected: string[]) => {
                            console.log(selected);
                            return (
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                {selected.map((object) => {
                                    return (
                                        <Chip key={object} label={object} />
                                    )
                                })}
                            </Box>
                        )}}
                    >
                        {objects.map((object) => (
                            <MenuItem
                                key={object.id}
                                value={object.name}
                            >
                                {object.name}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
                <Box>за периоды из Beds24 c медианой от</Box>
                <TextField 
                    onChange={handleChangeStartMedian} 
                    label="От" 
                    variant="outlined" />
                <Box>до</Box>
                <TextField 
                    onChange={handleChangeEndMedian} 
                    label="До" 
                    variant="outlined" />
                <Button variant="contained" onClick={handleSubmit}>Отправить</Button>
            </Stack>
            <AnalyticsTable analyticsData={analyticsData}></AnalyticsTable>
        </Stack>
    )
}
