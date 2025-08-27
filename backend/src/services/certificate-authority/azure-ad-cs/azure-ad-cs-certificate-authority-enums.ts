export enum AzureAdCsTemplateType {
  WEB_SERVER = "WebServer",
  COMPUTER = "Computer",
  USER = "User",
  DOMAIN_CONTROLLER = "DomainController",
  SUBORDINATE_CA = "SubordinateCA"
}

export enum AzureAdCsAuthMethod {
  CLIENT_CERTIFICATE = "client-certificate",
  KERBEROS = "kerberos"
}
