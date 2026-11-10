import type { CSSProperties } from "react";

export const DEFAULT_FAVICON_URL = "/infisical.ico";
// v4-check-ignore raw-color -- customer brand colors from the org's branding config, not product chrome
export const DEFAULT_PRIMARY = "#0e1014";
// v4-check-ignore raw-color -- customer brand colors from the org's branding config, not product chrome
export const DEFAULT_SECONDARY = "#1e1f22";
// v4-check-ignore raw-color -- customer brand colors from the org's branding config, not product chrome
export const HEX_COLOR_EXAMPLE = "#FF5733";
// v4-check-ignore raw-color -- customer brand colors from the org's branding config, not product chrome
export const SAMPLE_BRAND_PRIMARY = "#14324a";
// v4-check-ignore raw-color -- customer brand colors from the org's branding config, not product chrome
export const SAMPLE_BRAND_SECONDARY = "#f4f1ea";

const isLight = (hex: string) => {
  const value = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((at) => parseInt(value.substring(at, at + 2), 16));
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5;
};

const shift = (hex: string, amount: number) => {
  const value = hex.replace("#", "");
  return `#${[0, 2, 4]
    .map((at) =>
      Math.max(0, Math.min(255, parseInt(value.substring(at, at + 2), 16) + amount))
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`;
};

export const brandStyle = (primary: string, secondary: string) => {
  const lightPanel = isLight(secondary);
  return {
    "--brand-page": `linear-gradient(to bottom right, ${shift(primary, isLight(primary) ? -20 : 20)}, ${primary})`,
    "--brand-panel": secondary,
    "--brand-line": shift(secondary, lightPanel ? -30 : 30),
    "--brand-inset": shift(secondary, lightPanel ? -15 : 15),
    // v4-check-ignore raw-color -- customer brand colors from the org's branding config, not product chrome
    "--brand-text": lightPanel ? "#1a1a1a" : "#f5f5f5",
    // v4-check-ignore raw-color -- customer brand colors from the org's branding config, not product chrome
    "--brand-muted": lightPanel ? "#1a1a1acc" : "#f5f5f5cc"
  } as CSSProperties;
};

export const errorOf = (error: unknown) => {
  const data = (error as { response?: { data?: { statusCode?: number; message?: string } } })
    ?.response?.data;
  return { status: data?.statusCode, message: data?.message };
};
