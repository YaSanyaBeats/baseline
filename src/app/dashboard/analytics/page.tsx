'use client'

import AnalyticsTable from "@/components/analytics/AnalyticsTable";
import ObjectsMultiSelect from "@/components/objectsMultiSelect/ObjectsMultiSelect";
import { getAnalytics } from "@/lib/beds24/getAnalytics";
import { AnalyticsFilterData, AnalyticsResponse, Object } from "@/lib/types";
import { useObjects } from "@/providers/ObjectsProvider";
import { Alert, Box, Button, FormControl, FormHelperText, MenuItem, Select, Skeleton, Snackbar, Stack, TextField, Typography } from "@mui/material"
import React, { ChangeEvent } from "react";
import { useTranslation } from "@/i18n/useTranslation";

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
    startMedian: '25',
    endMedian: '75',
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
    const { t } = useTranslation();
    const [loadAnalytics, setLoadAnalytics] = React.useState(false);
    const [analyticsData, setAnalyticsData] = React.useState<AnalyticsResponse | null>(null);

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

        const validObjects = filterData.objects.filter((o) => o.id > 0);
        if(!validObjects.length) {
            newErrors = {
                ...newErrors,
                objects: {
                    error: true,
                    message: t('analytics.selectAtLeastOneObject')
                }
            };
            isValid = false;
        }

        if(!filterData.startMedian || !checkNumber(filterData.startMedian) || !checkMedian(filterData.startMedian)) {
            newErrors = {
                ...newErrors,
                startMedian: {
                    error: true,
                    message: t('analytics.enterValidNumber')
                }
            };
            isValid = false;
        }

        if(!filterData.endMedian || !checkNumber(filterData.endMedian) || !checkMedian(filterData.endMedian)) {
            newErrors = {
                ...newErrors,
                endMedian: {
                    error: true,
                    message: t('analytics.enterValidNumber')
                }
            };
            isValid = false;
        }

        if(!filterData.startDate || !isValidDateString(filterData.startDate)) {
            newErrors = {
                ...newErrors,
                startDate: {
                    error: true,
                    message: t('analytics.enterDate')
                }
            };
            isValid = false;
        }

        if(!filterData.endDate || !isValidDateString(filterData.endDate)) {
            newErrors = {
                ...newErrors,
                endDate: {
                    error: true,
                    message: t('analytics.enterDate')
                }
            };
            isValid = false;
        }

        if((filterData.periodMode == 'custom') && (!filterData.step || !checkNumber(filterData.step) || +filterData.step <= 0)) {
            newErrors = {
                ...newErrors,
                step: {
                    error: true,
                    message: t('analytics.enterPositiveNumber')
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
            const analyticsFilterData = {
                ...filterData,
                objects: filterData.objects.filter((o) => o.id > 0),
            };
            const currentAnalyticsData = await getAnalytics(analyticsFilterData);
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
        else {
            value = value.split('-').reverse().join('-');
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
        else {
            value = value.split('-').reverse().join('-');
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
        <>
            <Stack spacing={4}>
                <Stack direction={'row'} alignItems={"end"} spacing={3} flexWrap={'wrap'} useFlexGap>
                    <Stack direction={'column'} spacing={1}>
                        <Typography variant="body1" gutterBottom>{t('analytics.objects')}</Typography>
                        <ObjectsMultiSelect 
                        id="objects"
                        error={errors.objects.error}
                        helperText={errors.objects.message}
                        objects={objects.filter((o) => o.id > 0)} 
                        selectedObjects={filterData.objects.filter((o) => o.id > 0)} 
                        onChange={handleObjectChange} />
                    </Stack>
                    <Stack direction={'column'} spacing={1}>
                        <Typography variant="body1" gutterBottom>{t('analytics.medians')}</Typography>
                        <FormControl {...(errors.startMedian.error || errors.endMedian.error) ? { error: true } : {} }>
                            <Stack direction={'row'}>
                                <TextField
                                    id="startMedian"
                                    error={errors.startMedian.error}
                                    onChange={handleChangeStartMedian} 
                                    label={t('analytics.from')}
                                    placeholder="25"
                                    variant="outlined"
                                    sx={{
                                        width: '100px',
                                        '& .MuiOutlinedInput-root': {
                                            borderBottomRightRadius: 0,
                                            borderTopRightRadius: 0
                                        },
                                    }}
                                />
                                <TextField
                                    id="endMedian"
                                    error={errors.endMedian.error}
                                    onChange={handleChangeEndMedian} 
                                    label={t('analytics.to')}
                                    placeholder="75"
                                    variant="outlined" 
                                    sx={{
                                        width: '100px',
                                        '& .MuiOutlinedInput-root': {
                                            borderBottomLeftRadius: 0,
                                            borderTopLeftRadius: 0,
                                        },
                                        '& .MuiOutlinedInput-notchedOutline': {
                                            borderLeftColor: 'transparent',
                                        },
                                    }}
                                />
                            </Stack>
                            <FormHelperText id="my-helper-text">{errors.startMedian.message || errors.endMedian.message}</FormHelperText>
                        </FormControl>
                    </Stack>

                    <Stack direction={'column'} spacing={1}>
                        <Typography variant="body1" gutterBottom>{t('analytics.periods')}</Typography>
                        <FormControl>
                            <Select
                                value={filterData.periodMode}
                                onChange={handleChangePeriod}
                            >
                                <MenuItem value={'beds24'}>{t('analytics.fromBeds24')}</MenuItem>
                                <MenuItem value={'custom'}>{t('analytics.customPeriod')}</MenuItem>
                            </Select>
                        </FormControl>
                    </Stack>

                    {filterData.periodMode === 'custom' && (
                        <Stack direction={'column'} spacing={1}>
                            <Box>{t('analytics.step')}</Box>
                            <TextField
                                id="step"
                                error={errors.step.error}
                                helperText={errors.step.message}
                                onChange={handleChangeStep} 
                                label={t('analytics.days')}
                                placeholder="31"
                                variant="outlined"
                                />
                        </Stack>
                    )}

                    <Stack direction={'column'} spacing={1}>
                        <Box>{t('analytics.analyzedPeriod')}</Box>
                        <FormControl {...(errors.startDate.error || errors.endDate.error) ? { error: true } : {} }>
                            <Stack direction={'row'}>
                                <TextField
                                    id="startDate"
                                    error={errors.startDate.error}
                                    onChange={handleChangeStartDate} 
                                    label={t('analytics.dateFormat')}
                                    placeholder="01-01-2019"
                                    variant="outlined"
                                    sx={{
                                        width: '200px',
                                        '& .MuiOutlinedInput-root': {
                                            borderBottomRightRadius: 0,
                                            borderTopRightRadius: 0
                                        },
                                    }}
                                />
                                <TextField
                                    id="endDate"
                                    error={errors.endDate.error}
                                    onChange={handleChangeEndDate} 
                                    label={t('analytics.dateFormat')}
                                    placeholder="31-12-2026"
                                    variant="outlined"
                                    sx={{
                                        width: '200px',
                                        '& .MuiOutlinedInput-root': {
                                            borderBottomLeftRadius: 0,
                                            borderTopLeftRadius: 0,
                                        },
                                        '& .MuiOutlinedInput-notchedOutline': {
                                            borderLeftColor: 'transparent',
                                        },
                                    }}
                                />
                            </Stack>
                            <FormHelperText id="my-helper-text">{errors.startDate.message || errors.endDate.message}</FormHelperText>
                        </FormControl>
                    </Stack>

                    <Button 
                        variant="contained" 
                        size="large" 
                        loading={loadAnalytics} 
                        onClick={handleSubmit}
                        sx={{ height: '56px' }}
                    >
                        {t('common.submit')}
                    </Button>
                </Stack>

                {analyticsData && (
                    <AnalyticsTable analyticsData={analyticsData}></AnalyticsTable>
                )}
                
            </Stack>

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
                    {t('common.serverError')}
                </Alert>
            </Snackbar>
        </>
    )
}
