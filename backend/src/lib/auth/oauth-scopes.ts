// Public contract: shown on the consent screen and mapped to rules by the permission owners. Each product gets
// describe, read and write scopes, which the consent page offers as Describe Only, Read Only and Full Access. Only add
// one when a route or MCP tool accepting AuthMode.OAUTH serves it.
export enum OauthScope {
  SecretsDescribe = "secrets:describe",
  SecretsRead = "secrets:read",
  SecretsWrite = "secrets:write"
}
