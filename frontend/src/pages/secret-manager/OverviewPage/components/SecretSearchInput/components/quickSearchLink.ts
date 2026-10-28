import type { MouseEvent } from "react";

export const QUICK_SEARCH_ROUTE =
  "/organizations/$orgId/projects/secret-management/$projectId/overview" as const;

export const isPlainClick = (event: MouseEvent) =>
  event.button === 0 && !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey);
