import * as React from "react";
import { type LucideIcon } from "lucide-react";

import { iconShapes } from "./icon-data";

export type IconName = keyof typeof iconShapes;
export const iconNames = Object.keys(iconShapes) as IconName[];

type IconProps = Omit<React.ComponentPropsWithoutRef<"svg">, "name"> & {
  name?: IconName;
  icon?: LucideIcon;
  size?: number | string;
  label?: string;
};

export function Icon({
  name,
  icon: Fallback,
  size,
  strokeWidth,
  label,
  style,
  ref,
  ...props
}: IconProps & { ref?: React.Ref<SVGSVGElement> }) {
  const dimension = typeof size === "number" ? `${size}px` : size;
  const shared = {
    ref,
    "data-slot": "icon",
    role: label ? "img" : undefined,
    "aria-label": label,
    "aria-hidden": label ? undefined : true,
    focusable: "false" as const,
    style: { width: dimension, height: dimension, strokeWidth, ...style },
    ...props
  };
  if (name)
    return (
      <svg
        {...shared}
        data-icon-name={name}
        data-icon-source="custom"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {iconShapes[name].map((shape, index) =>
          React.createElement(shape.tag, { ...shape.attributes, key: index })
        )}
      </svg>
    );
  if (!Fallback) return null;
  return <Fallback {...shared} data-icon-source="lucide" />;
}
Icon.displayName = "Icon";
