import { PropsWithChildren, useLayoutEffect } from "react";
import type { Decorator } from "@storybook/react-vite";

import { ThemeProvider } from "../../src/components/v3/platform/ThemeProvider";

export const productAccents = [
  { value: "sm", title: "Secrets Management" },
  { value: "pki", title: "Certificates" },
  { value: "kms", title: "KMS" },
  { value: "ss", title: "Secret Scanning" },
  { value: "pam", title: "Privileged Access" },
  { value: "av", title: "Agent Vault" }
];

export const ThemePreview = ({
  children,
  theme,
  productAccent
}: PropsWithChildren<{ theme: string; productAccent: string }>) => {
  const resolvedAccent = productAccents.some(({ value }) => value === productAccent)
    ? productAccent
    : "sm";

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.add("overflow-visible");
    root.style.setProperty("--color-project", `var(--color-product-${resolvedAccent})`);
  }, [resolvedAccent]);

  return (
    <ThemeProvider
      pathname="/"
      forcedTheme={theme === "light" || theme === "system" ? theme : "dark"}
    >
      {children}
    </ThemeProvider>
  );
};

export const DocumentDecorator: Decorator = (Story, { globals }) => (
  <ThemePreview theme={globals.theme} productAccent={globals.productAccent}>
    <Story />
  </ThemePreview>
);
