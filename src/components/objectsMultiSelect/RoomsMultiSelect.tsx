import Checkbox from '@mui/material/Checkbox';
import TextField from '@mui/material/TextField';
import Autocomplete from '@mui/material/Autocomplete';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import { useObjects } from '@/providers/ObjectsProvider';
import { useEffect, useState } from 'react';
import { Typography } from '@mui/material';
import { UserObject } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

const icon = <CheckBoxOutlineBlankIcon fontSize="small" />;
const checkedIcon = <CheckBoxIcon fontSize="small" />;

interface Option {
    value: string | number,
    title: string,
    objectValue: number,
    objectName: string
}

type GroupedResult = Record<number, Option[]>;
const groupByObjectValue = (data: Option[]): UserObject[] => {
    const grouped = data.reduce((acc, item) => {
        const key = item.objectValue;
        if (!acc[key]) {
            acc[key] = [];
        }
        acc[key].push(item);
        return acc;
    }, {} as GroupedResult)

    return Object.entries(grouped).map(([objectValueStr, items]) => {
        const id = parseInt(objectValueStr, 10);
        const rooms = items
        .map(item => item.value)
        .sort((a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b))));

        return { id, rooms };
    });
};


export default function RoomsMultiSelect(props: {
    value: UserObject[],
    onChange: (value: UserObject[]) => void,
    label?: string,
    multiple?: boolean,
    /** По умолчанию — имя юнита (стабильная привязка). `id` — для отчётов (roomIds как числа). */
    roomValueMode?: 'name' | 'id',
}) {
    const { value, onChange, label, multiple = true, roomValueMode = 'name' } = props;
    const {objects} = useObjects();
    const { t } = useTranslation();
    const [options, setOptions] = useState<Option[]>();
    const [selectedOptions, setSelectedOptions] = useState<Option[]>([]);

    useEffect(() => {
        const currentOptons: Option[] = [];
        objects.forEach((object) => {
            object.roomTypes.forEach((room) => {
                const val = roomValueMode === 'id' ? room.id : (room.name != null && String(room.name).trim() !== '' ? String(room.name).trim() : `Unit ${room.id}`);
                currentOptons.push({
                    title: `${object.name}: ${room.name ? room.name : 'Room ' + room.id}`,
                    value: val,
                    objectValue: object.id,
                    objectName: object.propertyName || object.name  // Используем propertyName для группировки
                })
            })
        })
        setOptions(currentOptons);
    }, [objects, roomValueMode]);

    useEffect(() => {
        if(!value) {
            return;
        }
        const selectedOptons: Option[] = [];
        value.forEach((object) => {
            options?.forEach((option) => {
                if(object.id == option.objectValue && object.rooms.includes(option.value)) {
                    selectedOptons.push(option);
                }
            })
        })
        setSelectedOptions(selectedOptons);
    }, [options, value]);

    if(!options) {
        return (<></>);
    }
    
    return (
        <Autocomplete<Option, boolean>
            multiple={multiple}
            id="checkboxes-tags-demo"
            options={options}
            disableCloseOnSelect={multiple}
            getOptionLabel={(option: Option) => option.title}
            groupBy={(option: Option) => option.objectName}
            value={multiple ? selectedOptions : (selectedOptions.length > 0 ? selectedOptions[0] : null) as any}
            onChange={(event: any, newValue: any) => {
                if (!newValue) {
                    setSelectedOptions([]);
                    onChange([]);
                    return;
                }

                const optionsArray = Array.isArray(newValue) ? newValue : [newValue];
                setSelectedOptions(optionsArray);
                const grouped = groupByObjectValue(optionsArray);
                onChange(grouped);
            }}
            renderOption={(props, option: Option, { selected }) => {
                const { key, ...optionProps } = props;
                return (
                    <li key={key} {...optionProps} style={{padding: 0, marginLeft: 16}}>
                        <Checkbox
                            icon={icon}
                            checkedIcon={checkedIcon}
                            style={{ marginRight: 4 }}
                            checked={selected}
                        />
                        <Typography variant='body2'>
                            {option.title}
                        </Typography>
                    </li>
                );
            }}
            renderInput={(params) => (
                <TextField {...params} label={label || t('dashboard.hasAccessTo')} placeholder={`${t('common.objects')} ${t('common.and')} ${t('common.rooms')}`} />
            )}
        />
    );
}