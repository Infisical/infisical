import { type ResolvedTheme } from "../ThemeProvider";

type ProviderIconVariants = {
  onLight?: string;
};

export const PROVIDER_ICON_VARIANTS: Record<string, ProviderIconVariants> = {
  "DatadogWhite.png": { onLight: "Datadog.png" },
  "OpenAIWhite.png": { onLight: "OpenAI.png" }
};

export const getProviderIconPath = (icon: string, theme: ResolvedTheme) => {
  const variant = theme === "light" ? PROVIDER_ICON_VARIANTS[icon]?.onLight : undefined;
  return `/images/integrations/${variant ?? icon}`;
};
