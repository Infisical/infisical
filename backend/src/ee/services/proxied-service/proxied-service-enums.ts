export enum ProxiedServiceCredentialRole {
  HeaderRewrite = "header-rewrite",
  // referenced via z.nativeEnum, not by name; do not delete
  CredentialSubstitution = "credential-substitution"
}

export enum ProxiedServiceHeaderPurpose {
  Username = "username",
  Password = "password"
}

export enum ProxiedServiceSubstitutionSurface {
  Header = "header",
  Path = "path",
  Query = "query",
  Body = "body"
}
