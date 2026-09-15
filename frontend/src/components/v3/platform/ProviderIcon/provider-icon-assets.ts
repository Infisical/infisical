import { type ResolvedTheme } from "../ThemeProvider";

type ProviderIconVariants = {
  onLight?: string;
};

export const PROVIDER_ICON_VARIANTS: Record<string, ProviderIconVariants> = {
  "Amazon Web Services.png": { onLight: "Amazon Web Services.on-light.png" },
  "DatadogWhite.png": { onLight: "Datadog.png" },
  "Nutanix.png": { onLight: "Nutanix.on-light.png" },
  "OpenAIWhite.png": { onLight: "OpenAI.png" },
  "Venafi.png": { onLight: "Venafi.on-light.png" }
};

export const getProviderIconPath = (icon: string, theme: ResolvedTheme) => {
  const variant = theme === "light" ? PROVIDER_ICON_VARIANTS[icon]?.onLight : undefined;
  return `/images/integrations/${variant ?? icon}`;
};
