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
    };

export type CopySecretsEnvironment = {
  id: string;
  name: string;
  slug: string;
};

export type CopySecretsMode = "folder" | "contents";
