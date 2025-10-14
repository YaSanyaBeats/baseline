'use client'

import AnalyticsTable from "@/components/analytics/AnalyticsTable";
import ObjectsMultiSelect from "@/components/objectsMultiSelect/ObjectsMultiSelect";
import { getAnalytics } from "@/lib/beds24/getAnalytics";
import { getObjects } from "@/lib/beds24/objects";
import { AnalyticsFilterData, AnalyticsResult, Object } from "@/lib/types";
import { useObjects } from "@/providers/ObjectsProvider";
import { Box, Button, Chip, FormControl, InputLabel, MenuItem, OutlinedInput, Select, Skeleton, Stack, TextField } from "@mui/material"
import React from "react";


function checkNumber(value: string): boolean {
    return !isNaN(Number(value)) && value.trim() !== '';
}

export default function Page() {
    const { objects, loading, error, refreshObjects } = useObjects();
    const [loadAnalytics, setLoadAnalytics] = React.useState(false);
    const [analyticsData, setAnalyticsData] = React.useState<AnalyticsResult[][]>([]);

    const [filterData, setFilterData] = React.useState<AnalyticsFilterData>({
        objects: [],
        startMedian: 20,
        endMedian: 70
    });

    const handleObjectChange = (selectedObjects: Object[]) => {
        setFilterData({
            ...filterData,
            objects: selectedObjects,
        });
    }

    const handleSubmit = async () => {
        setLoadAnalytics(true);
        const currentAnalyticsData = await getAnalytics(filterData);
        setAnalyticsData(currentAnalyticsData);
        setLoadAnalytics(false);
    }

    const handleChangeStartMedian = (event: React.ChangeEvent<HTMLInputElement>) => {
        if(!checkNumber(event?.target?.value)) {
            return;
        }

        setFilterData({
            ...filterData,
            startMedian: +event.target.value
        });
    }

    const handleChangeEndMedian = (event: React.ChangeEvent<HTMLInputElement>) => {
        if(!checkNumber(event?.target?.value)) {
            return;
        }

        setFilterData({
            ...filterData,
            endMedian: +event.target.value
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
                <ObjectsMultiSelect objects={objects} selectedObjects={filterData.objects} onChange={handleObjectChange}></ObjectsMultiSelect>
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
                <Button variant="contained" loading={loadAnalytics} onClick={handleSubmit}>Отправить</Button>
            </Stack>
            <AnalyticsTable analyticsData={analyticsData}></AnalyticsTable>
            {/* {analyticsData.map((data: AnalyticsResult[], index) => {
                return()
            })} */}
        </Stack>
    )
}
