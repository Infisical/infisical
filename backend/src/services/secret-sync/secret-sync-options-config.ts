export type TSyncOptionsConfig = {
  canImportSecrets: boolean;
  canRemoveSecretsOnDeletion?: boolean;
  supportsKeySchema?: boolean;
  supportsDisableSecretDeletion?: boolean;
};
