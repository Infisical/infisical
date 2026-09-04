export type CopySecretsSource = {
  id: string;
  name: string;
  path: string;
  isValueHidden?: boolean;
  isRotated?: boolean;
  isHoneyToken?: boolean;
  previewStatus?: "new" | "conflict" | "overwrite";
};

export type CopySecretsInvocation =
  | {
      origin: "toolbar";
      sourceEnvironmentSlug: string;
      sourcePath: string;
    }
  | {
      origin: "row";
      sourceEnvironmentSlug: string;
      sourcePath: string;
      secrets: CopySecretsSource[];
    }
  | {
      origin: "bulk";
      sourcePath: string;
      selectedSecretCount: number;
      secretsByEnvironment: Record<string, CopySecretsSource[]>;
      sourceEnvironmentSlug?: string;
      folderNames: string[];
      foldersByEnvironment: Record<string, CopySecretsFolder[]>;
    };

export type CopySecretsFolder = {
  path: string;
  previewStatus?: "new";
};

export type CopySecretsAttributes = {
  value: boolean;
  comment: boolean;
  tags: boolean;
  metadata: boolean;
  skipMultilineEncoding: boolean;
};

export type CopySecretsEnvironment = {
  id: string;
  name: string;
  slug: string;
};

export type CopySecretsMode = "folder" | "contents";
