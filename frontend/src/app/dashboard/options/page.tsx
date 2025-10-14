'use client'

import { getObjects } from "@/lib/beds24/objects";
import { useObjects } from "@/providers/ObjectsProvider";
import { Box, Button, FormControl, Stack, TextField, Typography } from "@mui/material";
import { Object, OptionsFormData } from "@/lib/types";
import React from "react";
import ObjectsMultiSelect from "@/components/objectsMultiSelect/ObjectsMultiSelect";
import { getOptions, sendOptions } from "@/lib/options";


export default function Page() {
    const { objects, loading, error, refreshObjects } = useObjects();
    const [loadOptions, setLoadOptions] = React.useState(false);
    const [loadForm, setLoadForm] = React.useState(false);

    const [formData, setFormData] = React.useState<OptionsFormData>({
        excludeObjects: [],
        excludeSubstr: ''
    });

    React.useEffect(() => {
        const fetchObjects = async () => {
            try {
                setLoadOptions(true);
                const options = await getOptions();
                setFormData(options);
            } finally {
                setLoadOptions(false); 
            }
        };

        fetchObjects();
            
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
        setLoadForm(false);
    }
    
    return (
        <Stack spacing={2}>
            <Box>
                <Typography variant="h5" gutterBottom>Игнорировать в системе выбранные объекты:</Typography>
                <ObjectsMultiSelect objects={objects} selectedObjects={formData.excludeObjects} onChange={handleObjectChange}></ObjectsMultiSelect>
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