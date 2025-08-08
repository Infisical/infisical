import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import { TSecretRotationV2ListItem } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

export const AZURE_CERTIFICATE_ROTATION_LIST_OPTION: TSecretRotationV2ListItem = {
  name: "Azure Certificate",
  type: SecretRotation.AzureCertificate,
  connection: AppConnection.AzureCertificate,
  template: {
    secretsMapping: {
      publicKey: "AZURE_PUBLIC_KEY",
      privateKey: "AZURE_PRIVATE_KEY"
    }
  }
};

export const AZURE_CERTIFICATE_DEFAULTS = {
  KEY_ALGORITHM: "RSA_2048",
  KEY_USAGES: ["digitalSignature", "keyEncipherment"],
  MAX_VALIDITY_DAYS: 1095, // 3 years - Azure maximum
  MAX_CERTIFICATES: 2, // Maximum number of certificates to maintain during rotation
  EXPIRY_PADDING_DAYS: 3 // Extra days added to certificate validity
} as const;

export const SUPPORTED_KEY_ALGORITHMS = ["RSA_2048", "RSA_4096", "ECDSA_P256", "ECDSA_P384"] as const;

export const SUPPORTED_KEY_USAGES = [
  "digitalSignature",
  "keyEncipherment",
  "keyAgreement",
  "keyCertSign",
  "crlSign",
  "dataEncipherment",
  "nonRepudiation"
] as const;
