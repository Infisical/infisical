export type TParsedEnv = Record<
  string,
  {
    value: string;
    comments: string[];
    tagSlugs?: string[];
    secretMetadata?: { key: string; value: string }[];
    skipMultilineEncoding?: boolean;
  }
>;
