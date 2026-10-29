export enum GitHubSyncScope {
  Repository = "repository",
  Organization = "organization",
  RepositoryEnvironment = "repository-environment"
}

export enum GitHubSyncSecretType {
  Actions = "actions",
  Dependabot = "dependabot",
  Codespaces = "codespaces"
}

export enum GitHubSyncVisibility {
  All = "all",
  Private = "private",
  Selected = "selected"
}
