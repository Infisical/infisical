import * as React from "react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";

import { cn } from "../lib/utils";
import { Button } from "./button";
import { Input, type InputProps } from "./input";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

import styles from "./color-picker.module.css";
import controlStyles from "./controls.module.css";

export type ColorPreset = { name: string; value: string };

export const tagColorPresets: readonly ColorPreset[] = [
  { name: "Gray", value: "#bec2c8" }, // v4-check-ignore raw-color -- stored tag color
  { name: "Blue", value: "#95a2b3" }, // v4-check-ignore raw-color -- stored tag color
  { name: "Purple", value: "#5e6ad2" }, // v4-check-ignore raw-color -- stored tag color
  { name: "Teal", value: "#26b5ce" }, // v4-check-ignore raw-color -- stored tag color
  { name: "Green", value: "#4cb782" }, // v4-check-ignore raw-color -- stored tag color
  { name: "Yellow", value: "#f2c94c" }, // v4-check-ignore raw-color -- stored tag color
  { name: "Orange", value: "#f2994a" }, // v4-check-ignore raw-color -- stored tag color
  { name: "Pink", value: "#f7c8c1" }, // v4-check-ignore raw-color -- stored tag color
  { name: "Red", value: "#eb5757" } // v4-check-ignore raw-color -- stored tag color
];

const hexColor = /^#[0-9a-f]{6}$/i;

const swatchStyle = (color: string) =>
  hexColor.test(color) ? ({ "--v4-color-picker-value": color } as React.CSSProperties) : undefined;

export type ColorPickerProps = Omit<
  InputProps,
  "value" | "defaultValue" | "onChange" | "trailing" | "mono" | "kbd" | "icon" | "type"
> & {
  value: string;
  onChange: (value: string) => void;
  presets?: readonly ColorPreset[];
  ref?: React.Ref<HTMLInputElement>;
};

export function ColorPicker({
  value,
  onChange,
  presets,
  disabled,
  readOnly,
  placeholder = "#000000", // v4-check-ignore raw-color -- shows the hex format the field takes
  ...props
}: ColorPickerProps) {
  const [open, setOpen] = React.useState(false);
  const locked = Boolean(disabled || readOnly);
  const preset = presets?.find((entry) => entry.value.toLowerCase() === value.toLowerCase());
  const swatch = (
    <span
      data-slot="color-picker-swatch"
      data-empty={hexColor.test(value) ? undefined : ""}
      className={styles.swatch}
      style={swatchStyle(value)}
      aria-hidden
    />
  );
  return (
    <Input
      {...props}
      mono
      autoComplete="off"
      spellCheck={false}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      readOnly={readOnly}
      onChange={(event) => onChange(event.target.value)}
      trailing={
        presets?.length ? (
          <Popover open={open && !locked} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={preset ? `Preset colors, ${preset.name} selected` : "Preset colors"}
                disabled={locked}
              >
                {swatch}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" data-width="content">
              <RadioGroupPrimitive.Root
                aria-label="Preset colors"
                data-slot="color-picker-palette"
                className={styles.palette}
                value={preset?.value ?? ""}
                disabled={locked}
                onValueChange={(next) => {
                  if (!locked) onChange(next);
                }}
              >
                {presets.map((entry) => (
                  <RadioGroupPrimitive.Item
                    key={entry.value}
                    value={entry.value}
                    aria-label={entry.name}
                    data-slot="color-picker-option"
                    className={cn(styles.option, controlStyles.focusOutline)}
                    style={swatchStyle(entry.value)}
                    onClick={(event) => {
                      if (event.detail > 0) setOpen(false);
                    }}
                  />
                ))}
              </RadioGroupPrimitive.Root>
            </PopoverContent>
          </Popover>
        ) : (
          swatch
        )
      }
    />
  );
}
ColorPicker.displayName = "ColorPicker";
