'use client'

import { FormControl, InputLabel, Select, OutlinedInput, Box, Chip, MenuItem, FormHelperText } from "@mui/material";
import { Object } from "@/lib/types";

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


export default function ObjectsMultiSelect(props: { id: string, error: boolean, helperText: string, objects: Object[], selectedObjects: Object[], onChange: (selectedObjects: Object[]) => void}) {
    const { id, error, helperText, objects, selectedObjects, onChange } = props;

    const handleChange = (event: React.ChangeEvent<HTMLInputElement> | (Event & { target: { value: string[]; name: string; } })) => {
        const value = Array.isArray(event.target.value) ? event.target.value : [event.target.value];

        let selectedObjects = value.map((obj: string) => {
            return objects.find((a) => {
                return a.name === obj;
            });
        }).flatMap(obj => obj ?? []);

        if(value.includes('All')) {
            selectedObjects = objects.flatMap(obj => obj ?? []);
            selectedObjects.push({
                id: 1,
                name: 'All',
                roomTypes: []
            })
        }
        else {
            if(objects.length == selectedObjects.length) {
                selectedObjects = [];
            }
        }

        if(selectedObjects === undefined) {
            return;
        }

        onChange(selectedObjects);
    }

    return (
        <FormControl sx={{ width: 300 }} {...error ? { error: true } : {} }>
            <InputLabel id="objects-select">Выберите объект</InputLabel>
            <Select
                labelId="objects-select"
                id={id}
                multiple
                value={selectedObjects.map((obj) => {return obj.name})}
                onChange={handleChange}
                input={<OutlinedInput label="Выберите объект" />}
                MenuProps={MenuProps}
                renderValue={(selected: string[]) => {
                    if(selected.length < 5) {
                        return (
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                {selected.map((object) => {
                                    return (
                                        <Chip key={object} label={object} />
                                    )
                                })}
                            </Box>
                        )
                    }
                    else {
                        return (
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                <Chip label={`Выбрано ${selected.length} объектов`} />
                            </Box>
                        )
                    }
                }}
            >
                <MenuItem value={'All'}>Выбрать все</MenuItem>
                {objects.map((object) => (
                    <MenuItem
                        key={object.id}
                        value={object.name}
                    >
                        {object.name}
                    </MenuItem>
                ))}
            </Select>
            <FormHelperText>{helperText}</FormHelperText>
        </FormControl>
    )
}