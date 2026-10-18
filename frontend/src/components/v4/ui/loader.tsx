import * as React from "react";
import { cn } from "cn";

import { Spinner } from "./spinner";

import styles from "./loader.module.css";

export type LoaderProps = Omit<React.ComponentPropsWithoutRef<"div">, "children"> & {
  loading?: boolean;
  label: string;
  description?: string;
  size?: "base" | "page";
  delay?: number;
  children?: React.ReactNode;
};

export const Loader = React.forwardRef<HTMLDivElement, LoaderProps>(
  (
    {
      loading = true,
      label,
      description,
      size = "base",
      delay = 300,
      children,
      className,
      ...props
    },
    ref
  ) => {
    // eslint-disable-next-line react/jsx-no-useless-fragment -- A forwardRef render returns an element, not a bare node.
    if (!loading) return <>{children}</>;
    return (
      <div
        ref={ref}
        data-slot="loader"
        data-size={size}
        className={cn(styles.loader, className)}
        {...props}
      >
        <Spinner size={size} label={label} description={description} delay={delay} />
      </div>
    );
  }
);
Loader.displayName = "Loader";
