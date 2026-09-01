export type ComponentDeprecation = {
  replacement: string;
  guidance: string;
};

export const defineComponentDeprecation = (deprecation: ComponentDeprecation) => deprecation;
