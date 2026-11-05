import { useCallback } from "react";

import { useV4Mode } from "./data/adapters";
import type { V4Mode } from "./mode";
import { v4Routes } from "./routes";

type RouteNode = { type: string; path?: string; file?: string; children?: RouteNode[] };

const segmentsOf = (path: string) => path.split("/").filter(Boolean);

const leafPatterns = (node: RouteNode, prefix: string): string[][] => {
  if (node.type === "index") return [segmentsOf(prefix)];
  const path = `${prefix}${node.path ?? ""}`;
  if (node.children?.length) return node.children.flatMap((child) => leafPatterns(child, path));
  const segments = segmentsOf(path);
  return node.file && segments[segments.length - 1] !== "$" ? [segments] : [];
};

const v4Patterns = leafPatterns(v4Routes as RouteNode, "");

const hasV4Twin = (pathname: string) => {
  const segments = segmentsOf(pathname);
  return v4Patterns.some(
    (pattern) =>
      pattern.length === segments.length &&
      pattern.every((part, i) => part.startsWith("$") || part === segments[i])
  );
};

export const resolveV4Href = (href: string, mode: V4Mode) => {
  if (mode === "demo" || !href.startsWith("/v4/")) return href;
  const pathname = href.split(/[?#]/)[0];
  return hasV4Twin(pathname) ? href : href.slice("/v4".length);
};

export const useResolveV4Href = () => {
  const mode = useV4Mode();
  return useCallback((href: string) => resolveV4Href(href, mode), [mode]);
};
