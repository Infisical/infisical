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
      destinationEnvironmentSlug: string;
      destinationPath: string;
    }
  | {
      origin: "row" | "bulk";
      sourceEnvironmentSlug: string;
      sourcePath: string;
      secrets: CopySecretsSource[];
    };

export type CopySecretsEnvironment = {
  id: string;
  name: string;
  slug: string;
};

export type CopySecretsMode = "folder" | "contents";
