export interface SecretVersionData {
  isRedacted?: boolean;
  secretKey?: string;
  secretValue?: string;
  secretValueHidden?: boolean;
  secretComment?: string;
  tags?: Array<{ slug: string; color: string }>;
  secretMetadata?: Array<{ key: string; value: string; isEncrypted?: boolean }>;
  skipMultilineEncoding?: boolean;
}

export interface FolderVersionData {
  name?: string;
  description?: string;
}
