"use client";

import { useMemo } from "react";
import { SingleValue } from "react-select";
import CreatableSelect from "react-select/creatable";
import { useTheme } from "next-themes";

type Props = {
    onChange: (values?: string) => void;
    onCreate?: (values: string) => void;
    options?: { label: string; value: string }[];
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
}: Props) => {
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === "dark";

    const onSelect = (
        option: SingleValue<{ label: string; value: string }>
    ) => {
        onChange(option?.value);
    };

    const formattedValue = useMemo(() => {
        return options.find((option) => option.value === value) || null;
    }, [options, value]);

    const customStyles = {
        control: (base: any, state: any) => ({
            ...base,
            backgroundColor: isDark ? "#020618" : "#fff",
            borderColor: state.isFocused
                ? "#6366f1" // blue-500 for focus
                : (isDark ? "#2D334D" : "#b6c5d5"), // gray-blue for inactive
            boxShadow: state.isFocused
                ? "0 0 0 2px #e0e7ff" // subtle blue ring (blue-100)
                : "none",
            borderWidth: "1.5px",
            borderRadius: "6px",
            minHeight: 40,
            color: isDark ? "#fff" : "#000",
            transition: "border-color 0.2s, box-shadow 0.2s",
            "&:hover": {
                borderColor: "#90a1b9",
            },
        }),
        menu: (base: any) => ({
            ...base,
            backgroundColor: isDark ? "#181C2A" : "#fff",
            color: isDark ? "#fff" : "#000",
            border: isDark ? "1px solid #2D334D" : "1px solid #e2e8f0",
            zIndex: 50,
        }),
        option: (base: any, state: any) => ({
            ...base,
            backgroundColor: state.isSelected
                ? (isDark ? "#232A3A" : "#e0e7ef")
                : state.isFocused
                ? (isDark ? "#232A3A" : "#f3f4f6")
                : "transparent",
            color: isDark ? "#fff" : "#000",
            cursor: "pointer",
        }),
        singleValue: (base: any) => ({
            ...base,
            color: isDark ? "#fff" : "#000",
        }),
        placeholder: (base: any) => ({
            ...base,
            color: isDark ? "#8A94A6" : "#6b7280",
        }),
        input: (base: any) => ({
            ...base,
            color: isDark ? "#fff" : "#000",
        }),
        dropdownIndicator: (base: any) => ({
            ...base,
            color: isDark ? "#8A94A6" : "#6b7280",
        }),
        indicatorSeparator: (base: any) => ({
            ...base,
            backgroundColor: isDark ? "#2D334D" : "#e2e8f0",
        }),
    };

    return (
        <CreatableSelect
            placeholder={placeholder}
            className="text-sm h-10"
            classNamePrefix="rs"
            styles={customStyles}
            value={formattedValue}
            onChange={onSelect}
            options={options}
            onCreateOption={onCreate}
            isDisabled={disabled}
            theme={(theme) => ({
                ...theme,
                borderRadius: 6,
                colors: {
                    ...theme.colors,
                    primary: "#90a1b9",
                    primary25: isDark ? "#232A3A" : "#f3f4f6",
                    neutral0: isDark ? "#181C2A" : "#fff",
                    neutral80: isDark ? "#fff" : "#000",
                },
            })}
        />
    );
};
