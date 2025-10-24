'use client'

import { FormControl, InputLabel, Select, OutlinedInput, Box, Chip, MenuItem } from "@mui/material";
import { AnalyticsFilterData, AnalyticsResult, Object } from "@/lib/types";

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


export default function ObjectsMultiSelect(props: { objects: Object[], selectedObjects: Object[], onChange: (selectedObjects: Object[]) => void}) {
    const { objects, selectedObjects, onChange } = props;

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
        <FormControl sx={{ width: 300 }}>
            <InputLabel id="objects-select">Выберите объект</InputLabel>
            <Select
                labelId="objects-select"
                id="demo-multiple-checkbox"
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
        </FormControl>
    )
}