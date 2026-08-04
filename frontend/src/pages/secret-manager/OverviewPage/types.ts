export enum EntryType {
  FOLDER = "folder",
  SECRET = "secret",
  SECRET_ROTATION = "secretRotation",
  HONEY_TOKEN = "honeyToken"
}

export enum RowType {
  Folder = "folder",
  DynamicSecret = "dynamic",
  Secret = "secret",
  SecretRotation = "rotation",
  SecretImport = "import",
  HoneyToken = "honeyToken",
  ProxiedService = "proxiedService"
}
