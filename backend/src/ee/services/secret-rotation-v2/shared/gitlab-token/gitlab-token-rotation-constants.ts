export const GITLAB_TOKEN_MAX_LIFETIME_DAYS = 365;

// Tokens expire at midnight UTC on their expiry date, so the padding keeps a token valid for a full day
// past the moment it is revoked by the next rotation.
export const GITLAB_TOKEN_EXPIRY_PADDING_DAYS = 3;

// A token lives for two rotation intervals (active, then inactive) plus the padding, which has to fit in
// GitLab's default maximum lifetime of 365 days.
export const GITLAB_TOKEN_MAX_ROTATION_INTERVAL_DAYS = 180;

export const GITLAB_TOKEN_NAME_MAX_LENGTH = 200;
export const GITLAB_TOKEN_DESCRIPTION_MAX_LENGTH = 255;

// https://docs.gitlab.com/security/tokens/access_token_scopes/ (admin-only scopes left out)
export enum GitLabTokenScope {
  Api = "api",
  ReadApi = "read_api",
  ReadUser = "read_user",
  ReadRepository = "read_repository",
  WriteRepository = "write_repository",
  ReadRegistry = "read_registry",
  WriteRegistry = "write_registry",
  ReadVirtualRegistry = "read_virtual_registry",
  WriteVirtualRegistry = "write_virtual_registry",
  CreateRunner = "create_runner",
  ManageRunner = "manage_runner",
  AiFeatures = "ai_features",
  K8sProxy = "k8s_proxy",
  SelfRotate = "self_rotate"
}
