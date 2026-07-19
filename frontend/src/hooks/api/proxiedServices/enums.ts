export enum ProxiedServiceCredentialRole {
  HeaderRewrite = "header-rewrite",
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
