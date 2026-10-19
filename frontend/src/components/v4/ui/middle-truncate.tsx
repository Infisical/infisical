import * as React from "react";

import { cn } from "../lib/utils";

import styles from "./text.module.css";

export const MiddleTruncate = React.forwardRef<
  HTMLSpanElement,
  Omit<React.ComponentPropsWithoutRef<"span">, "children" | "title"> & {
    children?: string;
    text?: string;
    keepEnd?: number;
    mono?: boolean;
    title?: string | false;
  }
>(({ children, text, keepEnd = 8, mono = false, title, className, onCopy, ...props }, ref) => {
  const value = text ?? children ?? "";
  const host = React.useRef<HTMLSpanElement>(null);
  const measure = React.useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = React.useState(value);
  React.useImperativeHandle(ref, () => host.current!, []);
  React.useLayoutEffect(() => {
    const node = host.current;
    const ruler = measure.current;
    if (!node || !ruler) return;
    let alive = true;
    const fit = () => {
      if (!alive) return;
      const width = node.clientWidth;
      if (!width) {
        setVisible(value);
        return;
      }
      const fits = (candidate: string) => {
        ruler.textContent = candidate;
        return ruler.getBoundingClientRect().width <= width;
      };
      if (fits(value)) {
        setVisible(value);
        return;
      }
      const suffixLength = Math.min(Math.max(0, Math.floor(keepEnd)), value.length);
      let start = 0;
      let end = value.length;
      let result = "…";
      while (start <= end) {
        const count = Math.floor((start + end) / 2);
        const suffix = Math.min(suffixLength, count);
        const candidate = `${value.slice(0, count - suffix)}…${suffix ? value.slice(-suffix) : ""}`;
        if (fits(candidate)) {
          result = candidate;
          start = count + 1;
        } else end = count - 1;
      }
      setVisible(result);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(node);
    document.fonts?.ready.then(fit).catch(() => undefined);
    return () => {
      alive = false;
      observer.disconnect();
    };
  }, [value, keepEnd]);
  return (
    <span
      ref={host}
      data-slot="middle-truncate"
      className={cn(styles.truncate, mono && styles.mono, className)}
      title={title === false ? undefined : (title ?? value)}
      onCopy={(event) => {
        onCopy?.(event);
        if (!event.defaultPrevented) {
          event.clipboardData.setData("text/plain", value);
          event.preventDefault();
        }
      }}
      {...props}
    >
      <span className="sr-only">{value}</span>
      <span aria-hidden="true">{visible}</span>
      <span ref={measure} aria-hidden="true" className={styles.measure} />
    </span>
  );
});
MiddleTruncate.displayName = "MiddleTruncate";
