import * as React from "react";
import { cn } from "cn";
import { Slider as SliderPrimitive } from "radix-ui";

import controlStyles from "./controls.module.css";

const Slider = React.forwardRef<
  React.ComponentRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> & { thumbLabels?: readonly string[] }
>(
  (
    {
      className,
      defaultValue,
      value,
      min = 0,
      max = 100,
      thumbLabels,
      "aria-label": label,
      "aria-labelledby": labelledBy,
      ...props
    },
    ref
  ) => {
    const _values = React.useMemo(
      () => (Array.isArray(value) ? value : Array.isArray(defaultValue) ? defaultValue : [min]),
      [value, defaultValue, min]
    );

    return (
      <SliderPrimitive.Root
        ref={ref}
        data-slot="slider"
        defaultValue={defaultValue ?? [min]}
        value={value}
        min={min}
        max={max}
        className={cn(
          "relative flex w-full touch-none items-center select-none data-disabled:opacity-50 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-40 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col",
          className
        )}
        {...props}
      >
        <SliderPrimitive.Track
          data-slot="slider-track"
          className={cn(
            controlStyles.sliderTrack,
            "relative grow overflow-hidden data-[orientation=horizontal]:h-1 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1"
          )}
        >
          <SliderPrimitive.Range
            data-slot="slider-range"
            className={cn(
              controlStyles.sliderRange,
              "absolute select-none data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full"
            )}
          />
        </SliderPrimitive.Track>
        {Array.from({ length: _values.length }, (_, index) => (
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            key={index}
            aria-label={
              thumbLabels?.[index] ??
              (label
                ? `${label}${_values.length > 1 ? ` ${index + 1}` : ""}`
                : labelledBy
                  ? undefined
                  : `Value${_values.length > 1 ? ` ${index + 1}` : ""}`)
            }
            aria-labelledby={thumbLabels?.[index] ? undefined : labelledBy}
            className={cn(
              controlStyles.focusOutline,
              controlStyles.sliderThumb,
              "relative block shrink-0 select-none after:absolute after:-inset-2 disabled:pointer-events-none disabled:opacity-50"
            )}
          />
        ))}
      </SliderPrimitive.Root>
    );
  }
);
Slider.displayName = "Slider";

export { Slider };
