export enum SecretReplicationOperations {
  Create = "create",
  Update = "update",
  Delete = "delete"
}

export type TSyncSecretReplicationDTO = {
  secretPath: string;
  projectId: string;
  environmentId: string;
  folderId: string;
  secrets: {
    operation: SecretReplicationOperations;
    id: string;
    version: number;
  }[];
};
