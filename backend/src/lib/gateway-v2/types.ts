export enum GatewayProxyProtocol {
  Http = "http",
  Tcp = "tcp",
  Ping = "ping",
  Health = "health",
  Pam = "pam",
  PamRdpBrowser = "pam-rdp-browser",
  PamSessionCancellation = "pam-session-cancellation",
  Pkcs11 = "pkcs11",
  Adcs = "adcs",
  Discovery = "discovery",
  ConnectionTest = "connection-test",
  WinRm = "winrm"
}

export enum GatewayHttpProxyActions {
  InjectGatewayK8sServiceAccountToken = "inject-k8s-sa-auth-token",
  UseGatewayK8sServiceAccount = "use-k8s-sa"
}
