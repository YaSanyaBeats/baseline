'use client'

import { useObjects } from "@/providers/ObjectsProvider";
import { Box, Button, CircularProgress, FormControl, Stack, TextField, Typography } from "@mui/material";
import { Object, OptionsFormData } from "@/lib/types";
import React from "react";
import ObjectsMultiSelect from "@/components/objectsMultiSelect/ObjectsMultiSelect";
import { getOptions, sendOptions } from "@/lib/options";
import { getAllObjects } from '@/lib/beds24/objects';

export default function Page() {
    const { refreshObjects } = useObjects();
    const [ allObjects, setAllObjects] = React.useState<Object[] | null>(null);
    const [loadForm, setLoadForm] = React.useState(false);

    const [formData, setFormData] = React.useState<OptionsFormData>({
        excludeObjects: [],
        excludeSubstr: ''
    });

    React.useEffect(() => {
        getAllObjects().then((result) => {
            setAllObjects(result);
        })

        getOptions().then((options) => {
            setFormData(options);
        })
    }, [])

    const handleObjectChange = (selectedObjects: Object[]) => {
        setFormData({
            ...formData,
            excludeObjects: selectedObjects,
        });
    }

    const handleChangeExcludeSubstr = (event: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({
            ...formData,
            excludeSubstr: event.target.value
        });
    }

    const handleSubmit = async () => {
        setLoadForm(true);
        await sendOptions(formData);
        refreshObjects();
        setLoadForm(false);
    }

    if(allObjects === null) {
        return <CircularProgress />;
    }
    
    return (
        <Stack spacing={2}>
            <Box>
                <Typography variant="h5" gutterBottom>Игнорировать в системе выбранные объекты:</Typography>
                <ObjectsMultiSelect id="objects" error={false} helperText="Выберите хотя бы один объект" objects={allObjects} selectedObjects={formData.excludeObjects} onChange={handleObjectChange}></ObjectsMultiSelect>
            </Box>
            <Box>
                <Typography variant="h5" gutterBottom>Игнорировать в системе объекты, содержащие в названии:</Typography>
                <FormControl>
                    <TextField 
                        onChange={handleChangeExcludeSubstr}
                        placeholder="Подстрока"
                        variant="outlined"
                        value={formData.excludeSubstr}
                        />
                </FormControl>
            </Box>
            <Box>
                <Button variant="contained" loading={loadForm} onClick={handleSubmit}>Отправить</Button>
            </Box>
        </Stack>
    )
}