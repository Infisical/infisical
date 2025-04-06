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

export enum SshCertKeyAlgorithm {
  RSA_2048 = "RSA_2048",
  RSA_4096 = "RSA_4096",
  ECDSA_P256 = "EC_prime256v1",
  ECDSA_P384 = "EC_secp384r1",
  ED25519 = "ED25519"
}

export const sshCertKeyAlgorithmToNameMap: { [K in SshCertKeyAlgorithm]: string } = {
  [SshCertKeyAlgorithm.RSA_2048]: "RSA 2048",
  [SshCertKeyAlgorithm.RSA_4096]: "RSA 4096",
  [SshCertKeyAlgorithm.ECDSA_P256]: "ECDSA P256",
  [SshCertKeyAlgorithm.ECDSA_P384]: "ECDSA P384",
  [SshCertKeyAlgorithm.ED25519]: "ED25519"
};

export const sshCertKeyAlgorithms = [
  {
    label: sshCertKeyAlgorithmToNameMap[SshCertKeyAlgorithm.RSA_2048],
    value: SshCertKeyAlgorithm.RSA_2048
  },
  {
    label: sshCertKeyAlgorithmToNameMap[SshCertKeyAlgorithm.RSA_4096],
    value: SshCertKeyAlgorithm.RSA_4096
  },
  {
    label: sshCertKeyAlgorithmToNameMap[SshCertKeyAlgorithm.ECDSA_P256],
    value: SshCertKeyAlgorithm.ECDSA_P256
  },
  {
    label: sshCertKeyAlgorithmToNameMap[SshCertKeyAlgorithm.ECDSA_P384],
    value: SshCertKeyAlgorithm.ECDSA_P384
  },
  {
    label: sshCertKeyAlgorithmToNameMap[SshCertKeyAlgorithm.ED25519],
    value: SshCertKeyAlgorithm.ED25519
  }
];
