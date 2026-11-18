// The named scopes a delegated OAuth token can carry. A public contract: the OAuth server shows them on the consent
// screen, and the permission owners map each to what it allows. Add one only when a route serves it.
export enum OauthScope {
  SecretsRead = "secrets:read"
}
