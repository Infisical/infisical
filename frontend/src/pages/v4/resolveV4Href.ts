import { useCallback } from "react";

import { useV4Mode } from "./data/adapters";
import { liveHref } from "./liveReady";
import type { V4Mode } from "./mode";

export const resolveV4Href = (href: string, mode: V4Mode) =>
  mode === "demo" ? href : liveHref(href);

export const useResolveV4Href = () => {
  const mode = useV4Mode();
  return useCallback((href: string) => resolveV4Href(href, mode), [mode]);
};
