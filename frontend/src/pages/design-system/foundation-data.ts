import { type CSSProperties } from "react";

import { toV4Theme, v4Themes } from "@app/components/v4/lib/theme-registry";
import { v4ThemedValue } from "@app/components/v4/lib/themes";
import tokens from "@app/components/v4/tokens.json";

/** A theme id, or a legacy light or dark that maps to peach or dark. */
export type ColorMode = string;

export const resolveColorToken = (name: string, mode: ColorMode): string => {
  const theme = toV4Theme(mode) ?? mode;
  const seen = new Set<string>();
  const resolve = (key: string): string => {
    if (seen.has(key)) throw new Error(`Circular color token ${key}`);
    seen.add(key);
    const token = tokens.color.tokens.find((entry) => entry.name === key);
    if (!token) throw new Error(`Unknown color token ${key}`);
    const value = v4ThemedValue(v4Themes, theme, key, token.value);
    const alias = value.match(/^\{([^}]+)\}$/)?.[1];
    return alias ? resolve(alias) : value;
  };
  return resolve(name);
};

/** Themes whose color tokens all resolve alike share one specimen, labelled with every name. */
export const themeGroups = v4Themes.reduce<
  { theme: string; scheme: string; label: string; key: string }[]
>((groups, theme) => {
  const key = tokens.color.tokens.map((token) => resolveColorToken(token.name, theme.id)).join();
  const match = groups.find((group) => group.key === key);
  if (match) match.label = `${match.label}, ${theme.name}`;
  else groups.push({ theme: theme.id, scheme: theme.scheme, label: theme.name, key });
  return groups;
}, []);

export const typographyStyles = tokens.type.groups.flatMap((group) =>
  group.styles.map((style) => ({ ...style, family: group.family }))
);

export const typeSpecimenStyle = (name: string): CSSProperties => {
  const style = typographyStyles.find((entry) => entry.name === name);
  if (!style) throw new Error(`Unknown typography role ${name}`);
  return {
    fontFamily: style.family === "mono" ? tokens.type.families.mono : tokens.type.families.sans,
    fontSize: style.fontSize,
    lineHeight: style.lineHeight,
    fontWeight: style.fontWeight,
    letterSpacing: "letterSpacing" in style ? style.letterSpacing : undefined
  };
};

export { tokens };
