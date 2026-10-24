import { type CSSProperties } from "react";

import tokens from "@app/components/v4/tokens.json";

export type ColorMode = "light" | "dark";

export const resolveColorToken = (name: string, mode: ColorMode): string => {
  const seen = new Set<string>();
  const resolve = (key: string): string => {
    if (seen.has(key)) throw new Error(`Circular color token ${key}`);
    seen.add(key);
    const token = tokens.color.tokens.find((entry) => entry.name === key);
    if (!token) throw new Error(`Unknown color token ${key}`);
    const value = token.value[mode];
    const alias = value.match(/^\{([^}]+)\}$/)?.[1];
    return alias ? resolve(alias) : value;
  };
  return resolve(name);
};

export const resolveSpacingToken = (name: string): string => {
  const seen = new Set<string>();
  const resolve = (key: string): string => {
    if (seen.has(key)) throw new Error(`Circular spacing token ${key}`);
    seen.add(key);
    const token = tokens.spacing.tokens.find((entry) => entry.name === key);
    if (!token) throw new Error(`Unknown spacing token ${key}`);
    const alias = token.value.match(/^\{([^}]+)\}$/)?.[1];
    return alias ? resolve(alias) : token.value;
  };
  return resolve(name);
};

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
