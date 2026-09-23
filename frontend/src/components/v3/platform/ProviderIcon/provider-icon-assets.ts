import { type ResolvedTheme } from "../ThemeProvider";

type ProviderIconVariants = {
  onLight?: string;
  onDark?: string;
};

export const PROVIDER_ICON_VARIANTS: Record<string, ProviderIconVariants> = {
  "Ab Initio.png": { onLight: "Ab Initio.on-light.png" },
  "Amazon Web Services.png": { onLight: "Amazon Web Services.on-light.png" },
  "Anthropic.png": { onDark: "Anthropic.on-dark.svg" },
  "DatadogWhite.png": { onLight: "Datadog.png" },
  "Express.png": { onLight: "Express.on-light.png" },
  "GitHub.png": { onLight: "GitHub.on-light.png" },
  "Gradle.png": { onLight: "Gradle.on-light.png" },
  "Infisical.png": { onLight: "Infisical.on-light.png" },
  "Next.js.png": { onLight: "Next.js.on-light.png" },
  "Nutanix.png": { onLight: "Nutanix.on-light.png" },
  "OpenAI.png": { onDark: "OpenAIWhite.png" },
  "OpenAIWhite.png": { onLight: "OpenAI.png" },
  "Railway.png": { onLight: "Railway.on-light.png" },
  "Remix.png": { onLight: "Remix.on-light.png" },
  "SSH.png": { onLight: "SSH.on-light.png" },
  "Venafi.png": { onLight: "Venafi.on-light.png" }
};

export const getProviderIconPath = (icon: string, theme: ResolvedTheme) => {
  const variants = PROVIDER_ICON_VARIANTS[icon];
  const variant = theme === "light" ? variants?.onLight : variants?.onDark;
  return `/images/integrations/${variant ?? icon}`;
};
