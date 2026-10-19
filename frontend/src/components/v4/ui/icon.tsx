import * as React from "react";

import { iconShapes } from "./icon-data";

export type IconName = keyof typeof iconShapes;
export const iconNames = Object.keys(iconShapes) as IconName[];

export const Icon = React.forwardRef<
  SVGSVGElement,
  React.ComponentPropsWithoutRef<"svg"> & { name: IconName; size?: number; label?: string }
>(({ name, size, strokeWidth = "var(--v4-stroke-icon)", label, ...props }, ref) => (
  <svg
    ref={ref}
    data-slot="icon"
    width={size ?? "var(--v4-size-icon)"}
    height={size ?? "var(--v4-size-icon)"}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    role={label ? "img" : undefined}
    aria-label={label}
    aria-hidden={label ? undefined : true}
    focusable="false"
    {...props}
  >
    {iconShapes[name].map((shape, index) =>
      React.createElement(shape.tag, { ...shape.attributes, key: index })
    )}
  </svg>
));
Icon.displayName = "Icon";
