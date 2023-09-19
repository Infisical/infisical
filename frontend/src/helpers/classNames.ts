import type { CxOptions } from "cva";
import { cx } from "cva";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: CxOptions) {
  return twMerge(cx(inputs));
}
