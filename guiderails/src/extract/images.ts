import fs from "node:fs";
import path from "node:path";

import type { ImageRef } from "../types.js";

/**
 * Image refs in docs/ look like they use four different roots, but only two resolution
 * mechanisms are actually needed, and this was verified against all 2,764 local refs:
 *
 *   absolute (`/images/...`, `/snippets/.../assets/...`,
 *             `/documentation/platform/.../images/...`)  ->  resolve against the docs root
 *   relative (`../../images/...`)                        ->  resolve against the file's dir
 *
 * Do NOT add a "try the basename under a sibling images/ dir" fallback. Mintlify serves
 * docs/ as the web root, so an absolute ref that misses is genuinely broken for a reader
 * even when a similarly named file exists elsewhere on disk. A lenient resolver here would
 * silently hide exactly the class of bug this linter exists to catch.
 */

const isExternal = (raw: string): boolean => /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(raw);

/** Strip the URL fragment and query so `foo.png#gh-dark-mode-only` still resolves. */
const stripUrlSuffix = (raw: string): string => {
  const noFragment = raw.split("#")[0] ?? raw;
  return noFragment.split("?")[0] ?? noFragment;
};

export type ImageResolver = {
  resolve: (raw: string, containingFile: string, alt: string, line: number) => ImageRef;
};

export const createImageResolver = (docsRoot: string): ImageResolver => {
  const existsCache = new Map<string, boolean>();

  const exists = (absolute: string): boolean => {
    const cached = existsCache.get(absolute);
    if (cached !== undefined) return cached;
    let value = false;
    try {
      value = fs.statSync(absolute).isFile();
    } catch {
      value = false;
    }
    existsCache.set(absolute, value);
    return value;
  };

  const resolve = (
    raw: string,
    containingFile: string,
    alt: string,
    line: number
  ): ImageRef => {
    const base: Omit<ImageRef, "resolved" | "exists"> = {
      raw,
      alt,
      line,
      file: containingFile
    };

    // Remote assets are somebody else's uptime problem; record them, never fail on them.
    if (isExternal(raw)) {
      return { ...base, resolved: null, exists: true };
    }

    const cleaned = stripUrlSuffix(raw).trim();
    if (cleaned.length === 0) {
      return { ...base, resolved: null, exists: false };
    }

    const absolute = cleaned.startsWith("/")
      ? path.join(docsRoot, cleaned)
      : path.resolve(path.dirname(containingFile), cleaned);

    return { ...base, resolved: absolute, exists: exists(absolute) };
  };

  return { resolve };
};
