import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      borderRadius: ["v4-xs", "v4-sm", "v4-control", "v4-pop", "v4-card", "v4-panel", "v4-inset"],
      opacity: ["v4-nudge", "v4-hover", "v4-press"]
    },
    classGroups: {
      shadow: [{ shadow: ["v4-raised", "v4-pop"] }],
      "font-size": [
        {
          text: [
            "v4-display",
            "v4-title-lg",
            "v4-title",
            "v4-title-sm",
            "v4-body-lg",
            "v4-body",
            "v4-label",
            "v4-small",
            "v4-caption",
            "v4-eyebrow",
            "v4-mono",
            "v4-mono-sm"
          ]
        }
      ]
    }
  }
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
