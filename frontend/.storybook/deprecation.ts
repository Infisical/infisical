export type ComponentDeprecation = {
  reason: string;
  replacement: string;
  migration: string;
};

export const defineComponentDeprecation = (deprecation: ComponentDeprecation) => deprecation;
