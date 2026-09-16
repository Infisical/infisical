import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      spacing: [
        "icon-xs",
        "icon-sm",
        "icon-md",
        "icon-lg",
        "icon-xl",
        "badge",
        "control-2xs",
        "control-xs",
        "control-sm",
        "control-md",
        "control-lg",
        "button-xs",
        "button-sm",
        "button-md",
        "button-lg",
        "row-sm",
        "row-md",
        "table-header",
        "table-row"
      ]
    }
  }
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
