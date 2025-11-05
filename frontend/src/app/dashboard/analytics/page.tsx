'use client'

import AnalyticsTable from "@/components/analytics/AnalyticsTable";
import ObjectsMultiSelect from "@/components/objectsMultiSelect/ObjectsMultiSelect";
import { getAnalytics } from "@/lib/beds24/getAnalytics";
import { AnalyticsFilterData, FullAnalyticsResult, Object } from "@/lib/types";
import { useObjects } from "@/providers/ObjectsProvider";
import { Alert, Box, Button, FormControl, InputLabel, MenuItem, Select, Skeleton, Snackbar, Stack, TextField } from "@mui/material"
import React, { ChangeEvent } from "react";


function checkNumber(value: string): boolean {
    return !isNaN(Number(value)) && value.trim() !== '';
}

function checkMedian(value: string): boolean {
    return +value >= 1 && +value <= 100;
}

function isValidDateString(str: string): boolean {
    // Сначала проверяем формат
    if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        return false;
    }

    // Создаём дату и проверяем, что она валидна
    const date = new Date(str);
    
    // Проверяем, что дата не Invalid Date
    if (isNaN(date.getTime())) {
        return false;
    }
    
    // Дополнительно проверяем, что строка точно соответствует исходному формату (без времени и т. п.)
    const reconstructed = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    
    return reconstructed === str;
}

const defaultFilterData = {
    objects: [],
    startMedian: '20',
    endMedian: '70',
    startDate: '2019-01-01',
    endDate: '2026-12-31',
    periodMode: 'beds24',
    step: '31'
}

const defaultErrors = {
    startMedian: {
        error: false,
        message: ''
    },
    endMedian: {
        error: false,
        message: ''
    },
    startDate: {
        error: false,
        message: ''
    },
    endDate: {
        error: false,
        message: ''
    },
    step: {
        error: false,
        message: ''
    },
    objects: {
        error: false,
        message: ''
    }
};

export default function Page() {
    const { objects, loading } = useObjects();
    const [loadAnalytics, setLoadAnalytics] = React.useState(false);
    const [analyticsData, setAnalyticsData] = React.useState<FullAnalyticsResult[]>([]);

    const [filterData, setFilterData] = React.useState<AnalyticsFilterData>(defaultFilterData);
    const [errors, setErrors] = React.useState(defaultErrors);
    const [snackbarOpen, setSnackbarOpen] = React.useState(false);

    const handleObjectChange = (selectedObjects: Object[]) => {
        setErrors({
            ...errors,
            objects: {
                error: false,
                message: ''
            }
        });

        setFilterData({
            ...filterData,
            objects: selectedObjects,
        });
    }

    const validate = () => {
        
        let isValid = true;
        let newErrors = defaultErrors;

        if(!filterData.objects.length) {
            newErrors = {
                ...newErrors,
                objects: {
                    error: true,
                    message: 'Выберите хотя бы один объект'
                }
            };
            isValid = false;
        }

        if(!filterData.startMedian || !checkNumber(filterData.startMedian) || !checkMedian(filterData.startMedian)) {
            newErrors = {
                ...newErrors,
                startMedian: {
                    error: true,
                    message: 'Введите корректное положительное число от 1 до 100'
                }
            };
            isValid = false;
        }

        if(!filterData.endMedian || !checkNumber(filterData.endMedian) || !checkMedian(filterData.endMedian)) {
            newErrors = {
                ...newErrors,
                endMedian: {
                    error: true,
                    message: 'Введите корректное положительное число от 1 до 100'
                }
            };
            isValid = false;
        }

        if(!filterData.startDate || !isValidDateString(filterData.startDate)) {
            newErrors = {
                ...newErrors,
                startDate: {
                    error: true,
                    message: 'Введите дату в формате ГГГГ-ММ-ДД'
                }
            };
            isValid = false;
        }

        if(!filterData.endDate || !isValidDateString(filterData.endDate)) {
            newErrors = {
                ...newErrors,
                endDate: {
                    error: true,
                    message: 'Введите дату в формате ГГГГ-ММ-ДД'
                }
            };
            isValid = false;
        }

        if((filterData.periodMode == 'custom') && (!filterData.step || !checkNumber(filterData.step) || +filterData.step <= 0)) {
            newErrors = {
                ...newErrors,
                step: {
                    error: true,
                    message: 'Введите корректное положительное число'
                }
            };
            isValid = false;
        }

        setErrors(newErrors);

        return isValid;
    }

    const handleSubmit = async () => {
        if(!validate()) {
            return;
        }

        setLoadAnalytics(true);
        try {
            const currentAnalyticsData = await getAnalytics(filterData);
            setAnalyticsData(currentAnalyticsData);
        }
        catch {
            setSnackbarOpen(true);
            setTimeout(() => {
                setSnackbarOpen(false);
            }, 6000);
        }
        
        setLoadAnalytics(false);
    }

    const handleChangeStartMedian = (event: React.ChangeEvent<HTMLInputElement>) => {
        let value = event?.target?.value;
        if(!value) {
            value = defaultFilterData.startMedian;
        }

        setErrors({
            ...errors,
            startMedian: {
                error: false,
                message: ''
            }
        });

        setFilterData({
            ...filterData,
            startMedian: value
        });
    }

    const handleChangeEndMedian = (event: React.ChangeEvent<HTMLInputElement>) => {
        let value = event?.target?.value;
        if(!value) {
            value = defaultFilterData.endMedian;
        }

        setErrors({
            ...errors,
            endMedian: {
                error: false,
                message: ''
            }
        });

        setFilterData({
            ...filterData,
            endMedian: value
        });
    }

    const handleChangeStartDate = (event: React.ChangeEvent<HTMLInputElement>) => {
        let value = event?.target?.value;
        if(!value) {
            value = defaultFilterData.startDate;
        }

        setErrors({
            ...errors,
            startDate: {
                error: false,
                message: ''
            }
        });

        setFilterData({
            ...filterData,
            startDate: value
        });
    }

    const handleChangeEndDate = (event: React.ChangeEvent<HTMLInputElement>) => {
        let value = event?.target?.value;
        if(!value) {
            value = defaultFilterData.endDate;
        }

        setErrors({
            ...errors,
            endDate: {
                error: false,
                message: ''
            }
        });

        setFilterData({
            ...filterData,
            endDate: value
        });
    }

    const handleChangePeriod = (event: ChangeEvent<Omit<HTMLInputElement, "value"> & { value: string; }> | (Event & { target: { value: string; name: string; }; })) => {
        setFilterData({
            ...filterData,
            periodMode: event.target.value
        });
    }

    const handleChangeStep = (event: React.ChangeEvent<HTMLInputElement>) => {
        let value = event?.target?.value;
        if(!value) {
            value = defaultFilterData.step;
        }

        setErrors({
            ...errors,
            step: {
                error: false,
                message: ''
            }
        });

        setFilterData({
            ...filterData,
            step: value
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
                <ObjectsMultiSelect 
                    id="objects"
                    error={errors.objects.error}
                    helperText={errors.objects.message}
                    objects={objects} 
                    selectedObjects={filterData.objects} 
                    onChange={handleObjectChange} />
                <Box>за периоды из Beds24 c медианой от</Box>
                <TextField
                    id="startMedian"
                    error={errors.startMedian.error}
                    helperText={errors.startMedian.message}
                    onChange={handleChangeStartMedian} 
                    label="От" 
                    variant="outlined" />
                <Box>до</Box>
                <TextField
                    id="endMedian"
                    error={errors.endMedian.error}
                    helperText={errors.endMedian.message}
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
                            id="step"
                            error={errors.step.error}
                            helperText={errors.step.message}
                            onChange={handleChangeStep} 
                            label="Дней" 
                            variant="outlined"
                            />
                    </Stack>
                )}
            </Stack>

            <Stack direction={'row'} alignItems={"center"} spacing={1}>
                <Box>Анализируемый период c </Box>
                <TextField
                    id="startDate"
                    error={errors.startDate.error}
                    helperText={errors.startDate.message}
                    onChange={handleChangeStartDate} 
                    label="ГГГГ-ММ-ДД" 
                    variant="outlined" />
                <Box>по</Box>
                <TextField
                    id="endDate"
                    error={errors.endDate.error}
                    helperText={errors.endDate.message}
                    onChange={handleChangeEndDate} 
                    label="ГГГГ-ММ-ДД" 
                    variant="outlined" />
                <Button variant="contained" loading={loadAnalytics} onClick={handleSubmit}>Отправить</Button>
            </Stack>
            <AnalyticsTable analyticsData={analyticsData}></AnalyticsTable>
            <Snackbar
                open={snackbarOpen}
                autoHideDuration={6000}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            >
                <Alert
                    severity="error"
                    variant="filled"
                    sx={{ width: '100%' }}
                >
                    Ошибка сервера
                </Alert>
            </Snackbar>
        </Stack>
    )
}
