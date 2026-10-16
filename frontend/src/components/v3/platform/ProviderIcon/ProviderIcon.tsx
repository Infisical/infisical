import * as React from "react";

import { useTheme } from "../ThemeProvider";
import { getProviderIconPath } from "./provider-icon-assets";

export type ProviderIconProps = Omit<React.ComponentPropsWithoutRef<"img">, "alt" | "src"> & {
  alt: string;
  icon: string;
};

export const ProviderIcon = ({ alt, icon, ...props }: ProviderIconProps) => {
  const { resolvedTheme } = useTheme();

  return <img {...props} alt={alt} src={getProviderIconPath(icon, resolvedTheme)} />;
};
