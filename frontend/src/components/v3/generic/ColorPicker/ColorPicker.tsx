import { forwardRef, useCallback, useEffect, useState } from "react";
import { HexColorPicker } from "react-colorful";

import { cn } from "../../utils";
import { Input } from "../Input";
import { Popover, PopoverContent, PopoverTrigger } from "../Popover";

import "./ColorPicker.css";

type ColorPickerProps = {
  value?: string;
  onChange?: (color: string) => void;
  disabled?: boolean;
  placeholder?: string;
  isError?: boolean;
  className?: string;
};

const ColorPicker = forwardRef<HTMLInputElement, ColorPickerProps>(
  ({ value = "", onChange, disabled, placeholder = "#000000", isError, className }, ref) => {
    const [localColor, setLocalColor] = useState(value);

    useEffect(() => {
      setLocalColor(value);
    }, [value]);

    const handlePickerChange = useCallback(
      (color: string) => {
        setLocalColor(color);
        onChange?.(color);
      },
      [onChange]
    );

    const handleInputChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        setLocalColor(newValue);
        onChange?.(newValue);
      },
      [onChange]
    );

    const isValidHex = /^#[0-9A-Fa-f]{6}$/.test(localColor);

    return (
      <div className={cn("flex items-center gap-2", className)}>
        <Input
          ref={ref}
          value={localColor}
          onChange={handleInputChange}
          placeholder={placeholder}
          disabled={disabled}
          isError={isError}
          className="flex-1 font-mono"
        />
        <Popover>
          <PopoverTrigger asChild disabled={disabled}>
            <button
              type="button"
              className={cn(
                "size-9 shrink-0 cursor-pointer rounded-md border border-border shadow-xs transition-colors",
                "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
                "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
                !isValidHex && "bg-container"
              )}
              style={{
                backgroundColor: isValidHex ? localColor : undefined
              }}
              disabled={disabled}
              aria-label="Pick a color"
            />
          </PopoverTrigger>
          <PopoverContent className="w-[220px] p-0" align="end">
            <HexColorPicker
              color={isValidHex ? localColor : "#000000"}
              onChange={handlePickerChange}
              className="!w-full"
            />
          </PopoverContent>
        </Popover>
      </div>
    );
  }
);

ColorPicker.displayName = "ColorPicker";

export { ColorPicker };
