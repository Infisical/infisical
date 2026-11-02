import * as React from "react";

import { cn } from "../lib/utils";
import { useV4Theme } from "../scope";
import { Icon } from "./icon";

import styles from "./provider-icon.module.css";

const providerIconVariants: Record<string, { onLight?: string; onDark?: string }> = {
  "Ab Initio.png": { onLight: "Ab Initio.on-light.png" },
  "Amazon Web Services.png": { onLight: "Amazon Web Services.on-light.png" },
  "Anthropic.png": { onDark: "Anthropic.on-dark.svg" },
  "DatadogWhite.png": { onLight: "Datadog.png" },
  "Express.png": { onLight: "Express.on-light.png" },
  "GitHub.png": { onLight: "GitHub.on-light.png" },
  "Gradle.png": { onLight: "Gradle.on-light.png" },
  "Infisical.png": { onLight: "Infisical.on-light.png" },
  "Kafka.png": { onLight: "Kafka.on-light.png" },
  "Next.js.png": { onLight: "Next.js.on-light.png" },
  "Nutanix.png": { onLight: "Nutanix.on-light.png" },
  "OpenAI.png": { onDark: "OpenAIWhite.png" },
  "OpenAIWhite.png": { onLight: "OpenAI.png" },
  "Railway.png": { onLight: "Railway.on-light.png" },
  "Remix.png": { onLight: "Remix.on-light.png" },
  "SSH.png": { onLight: "SSH.on-light.png" },
  "UltraDNS.png": { onLight: "UltraDNS.on-light.png" },
  "Venafi.png": { onLight: "Venafi.on-light.png" }
};

export const providerIconPath = (icon: string, theme: "light" | "dark") => {
  const variants = providerIconVariants[icon];
  const variant = theme === "light" ? variants?.onLight : variants?.onDark;
  return `/images/integrations/${variant ?? icon}`;
};

export function ProviderIcon({
  icon,
  alt,
  size = "md",
  className,
  onError,
  ref,
  ...props
}: Omit<React.ComponentPropsWithoutRef<"img">, "alt" | "src" | "width" | "height"> & {
  icon: string;
  alt: string;
  size?: "sm" | "md" | "lg" | "xl";
  ref?: React.Ref<HTMLImageElement>;
}) {
  const src = providerIconPath(icon, useV4Theme() ?? "light");
  const [failedSrc, setFailedSrc] = React.useState<string>();
  if (failedSrc === src)
    return (
      <span
        role={alt ? "img" : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
        data-slot="provider-icon"
        data-size={size}
        data-fallback=""
        className={cn(styles.icon, styles.fallback, className)}
      >
        <Icon name="apps" />
      </span>
    );
  return (
    <img
      ref={ref}
      {...props}
      src={src}
      alt={alt}
      data-slot="provider-icon"
      data-size={size}
      className={cn(styles.icon, className)}
      onError={(event) => {
        setFailedSrc(src);
        onError?.(event);
      }}
    />
  );
}
