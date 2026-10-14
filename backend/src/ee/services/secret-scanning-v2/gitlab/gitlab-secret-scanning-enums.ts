export enum GitLabDataSourceScope {
  // Every project the connection can read, with no group webhook to discover new ones.
  Account = "account",
  Project = "project",
  Group = "group"
}

export enum GitLabWebHookEvent {
  Push = "Push Hook"
}
