export * from "./service/kms-roles";

// The KMS product: its project roles for now. It grows as KMS (CMEK, KMIP) moves into a domain.
export class KmsModule {
  readonly name = "kms";
}
