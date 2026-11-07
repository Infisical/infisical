import * as React from "react";

import { readV4BootTheme } from "../lib/boot-theme";
import { toV4Theme, v4ThemeScheme } from "../lib/theme-registry";
import { cn } from "../lib/utils";
import { Loader } from "./loader";

import "../v4.css";
import styles from "./boot-loader.module.css";

export type BootLoaderProps = Omit<React.ComponentPropsWithoutRef<"div">, "children"> & {
  label: string;
  description?: string;
  theme?: string;
  fill?: "viewport" | "container";
  delay?: number;
};

/** The page loader for app and session boot, themed from storage so it renders before V4Scope. */
export function BootLoader({
  label,
  description,
  theme,
  fill = "viewport",
  delay,
  className,
  ref,
  ...props
}: BootLoaderProps & { ref?: React.Ref<HTMLDivElement> }) {
  const resolved = toV4Theme(theme) ?? readV4BootTheme();
  return (
    <div
      ref={ref}
      data-slot="boot-loader"
      data-fill={fill}
      data-theme={resolved}
      data-scheme={v4ThemeScheme(resolved)}
      className={cn("v4", styles.boot, className)}
      {...props}
    >
      <Loader size="page" label={label} description={description} delay={delay} />
    </div>
  );
}
BootLoader.displayName = "BootLoader";
