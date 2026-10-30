import { type ReactNode } from "react";

import styles from "./example-presentation.module.css";

type ExampleWidth = "compact" | "field" | "wide" | "full";

export const ExampleGrid = ({
  children,
  width = "field",
  ...props
}: {
  children: ReactNode;
  width?: ExampleWidth;
  "aria-label"?: string;
}) => (
  <div className={styles.grid} data-width={width} {...props}>
    {children}
  </div>
);

export const ExampleStack = ({
  children,
  ...props
}: {
  children: ReactNode;
  "aria-label"?: string;
}) => (
  <div className={styles.stack} {...props}>
    {children}
  </div>
);

export const ExampleCell = ({
  children,
  label,
  align,
  ...props
}: {
  children: ReactNode;
  label: ReactNode;
  align?: "start" | "stretch";
  "aria-label"?: string;
}) => (
  <figure className={styles.cell} data-align={align} {...props}>
    <div className={styles.specimen}>{children}</div>
    <figcaption className={styles.caption}>{label}</figcaption>
  </figure>
);

export const ExampleStage = ({
  children,
  height = "auto"
}: {
  children: ReactNode;
  height?: "auto" | "compact" | "medium" | "shell" | "app" | "data";
}) => (
  <div className={styles.stage} data-height={height}>
    {children}
  </div>
);
