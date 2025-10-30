'use client'

import AnalyticsTable from "@/components/analytics/AnalyticsTable";
import ObjectsMultiSelect from "@/components/objectsMultiSelect/ObjectsMultiSelect";
import { getAnalytics } from "@/lib/beds24/getAnalytics";
import { AnalyticsFilterData, FullAnalyticsResult, Object } from "@/lib/types";
import { useObjects } from "@/providers/ObjectsProvider";
import { Box, Button, FormControl, InputLabel, MenuItem, Select, Skeleton, Stack, TextField } from "@mui/material"
import React, { ChangeEvent } from "react";


function checkNumber(value: string): boolean {
    return !isNaN(Number(value)) && value.trim() !== '';
}

export default function Page() {
    const { objects, loading } = useObjects();
    const [loadAnalytics, setLoadAnalytics] = React.useState(false);
    const [analyticsData, setAnalyticsData] = React.useState<FullAnalyticsResult[]>([]);

    const [filterData, setFilterData] = React.useState<AnalyticsFilterData>({
        objects: [],
        startMedian: 20,
        endMedian: 70,
        startDate: '2019.01.01',
        endDate: '2029.12.31',
        periodMode: 'beds24',
        step: 0
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

    const handleChangeStartDate = (event: React.ChangeEvent<HTMLInputElement>) => {
        setFilterData({
            ...filterData,
            startDate: event.target.value
        });
    }

    const handleChangeEndDate = (event: React.ChangeEvent<HTMLInputElement>) => {
        setFilterData({
            ...filterData,
            endDate: event.target.value
        });
    }

    const handleChangePeriod = (event: ChangeEvent<Omit<HTMLInputElement, "value"> & { value: string; }> | (Event & { target: { value: string; name: string; }; })) => {
        setFilterData({
            ...filterData,
            periodMode: event.target.value
        });
    }

    const handleChangeStep = (event: React.ChangeEvent<HTMLInputElement>) => {
        if(!checkNumber(event?.target?.value)) {
            return;
        }

        setFilterData({
            ...filterData,
            step: +event.target.value
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
            </Stack>
            <Stack direction={'row'} alignItems={"center"} spacing={1}>
                <Box>Взять периоды</Box>
                <FormControl>
                    <InputLabel>Периоды</InputLabel>
                    <Select
                        value={filterData.periodMode}
                        label="Периоды"
                        onChange={handleChangePeriod}
                    >
                        <MenuItem value={'beds24'}>Из Beds24</MenuItem>
                        <MenuItem value={'custom'}>Кастомный период</MenuItem>
                    </Select>
                </FormControl>
                {filterData.periodMode === 'custom' && (
                    <Stack direction={'row'} alignItems={"center"} spacing={1}>
                        <Box>с шагом</Box>
                        <TextField 
                            onChange={handleChangeStep} 
                            label="Дней" 
                            variant="outlined" />
                    </Stack>
                )}
            </Stack>

            <Stack direction={'row'} alignItems={"center"} spacing={1}>
                <Box>Анализируемый период c </Box>
                <TextField 
                    onChange={handleChangeStartDate} 
                    label="ГГГГ-ММ-ДД" 
                    variant="outlined" />
                <Box>по</Box>
                <TextField
                    onChange={handleChangeEndDate} 
                    label="ГГГГ-ММ-ДД" 
                    variant="outlined" />
                <Button variant="contained" loading={loadAnalytics} onClick={handleSubmit}>Отправить</Button>
            </Stack>
            <AnalyticsTable analyticsData={analyticsData}></AnalyticsTable>
        </Stack>
    )
}
