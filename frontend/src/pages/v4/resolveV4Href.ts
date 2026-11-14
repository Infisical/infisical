import { useCallback } from "react";

import { resolveV4Href as resolveLiveHref } from "@app/helpers/v4Bridge";

import { useV4Mode } from "./data/adapters";
import type { V4Mode } from "./mode";

export const resolveV4Href = (href: string, mode: V4Mode) =>
  mode === "demo" ? href : resolveLiveHref(href);

export const useResolveV4Href = () => {
  const mode = useV4Mode();
  return useCallback((href: string) => resolveV4Href(href, mode), [mode]);
};
