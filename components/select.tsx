"use client"

import { useMemo } from "react";
import { SingleValue } from "react-select";
import CreateableSelect from "react-select/creatable";

type Props = {
    onChange: (values?: string) => void;
    onCreate?: (values: string) => void;
    options?: { label: string; value: string} [];
    value?: string | null | undefined;
    disabled?: boolean;
    placeholder?: string;
};

export const Select = ({
    value,
    onChange,
    onCreate,
    options = [],
    disabled,
    placeholder,
} : Props) => {
    const onSelect = (
        option: SingleValue<{ label: string, value: string }>
    ) => {
        onChange(option?.value);
    };

    const fromattedValue = useMemo(() => {
        return options.find((option) => option.value === value);
    }, [options, value]);

    return (
        <CreateableSelect 
            placeholder={placeholder}
            className="text-sm h-10"
            styles={{
                control: (base) => ({
                    ...base,
                    bordercolor: "#e2e8f0",
                    ":hover": {
                        bordercolor: "#e2e8f0",
                    },
                })
            }}
            value={fromattedValue}
            onChange={onSelect}
            options={options}
            onCreateOption={onCreate}
            isDisabled={disabled}
        />
    );
};