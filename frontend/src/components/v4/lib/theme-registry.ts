import tokens from "../tokens.json";
import { legacyV4Themes, type V4Scheme, type V4ThemeDefinition } from "./themes";

export const v4Themes = tokens.themes.list as unknown as readonly V4ThemeDefinition[];

export const defaultV4Theme: Readonly<Record<V4Scheme, string>> = { light: "peach", dark: "dark" };

/** A theme id from a stored, URL or hard-coded value; legacy light maps to peach, and legacy dark-alt to dark. */
export const toV4Theme = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const id = legacyV4Themes[value] ?? value;
  return v4Themes.some((theme) => theme.id === id) ? id : undefined;
};

export const v4ThemeScheme = (id: string): V4Scheme =>
  v4Themes.find((theme) => theme.id === id)?.scheme ?? "light";
