export enum SshCaStatus {
  ACTIVE = "active",
  DISABLED = "disabled"
}

export enum SshCertType {
  USER = "user",
  HOST = "host"
}

export const sshCertTypeToNameMap: { [K in SshCertType]: string } = {
  [SshCertType.USER]: "User",
  [SshCertType.HOST]: "Host"
};

export enum SshCaKeySource {
  INTERNAL = "internal",
  EXTERNAL = "external"
}
