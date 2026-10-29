import { SymmetricKeyAlgorithm } from "@app/lib/crypto/cipher";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError } from "@app/lib/errors";

export const KMS_KEY_NAME_MAX_LENGTH = 32;
export const ORG_DEFAULT_KMS_KEY_NAME = "poc-org-default";

export type TKmsKeyProps = {
  id: string;
  orgId: string;
  name: string;
  isDisabled: boolean;
  encryptedKeyMaterial: Buffer;
  encryptionAlgorithm: SymmetricKeyAlgorithm;
  version: number;
};

export class KmsKey {
  private constructor(private props: TKmsKeyProps) {}

  static create({
    orgId,
    name,
    encryptedKeyMaterial
  }: {
    orgId: string;
    name: string;
    encryptedKeyMaterial: Buffer;
  }): KmsKey {
    if (!name || name.length > KMS_KEY_NAME_MAX_LENGTH) {
      throw new BadRequestError({ message: `KMS key name must be 1 to ${KMS_KEY_NAME_MAX_LENGTH} characters` });
    }

    return new KmsKey({
      id: crypto.nativeCrypto.randomUUID(),
      orgId,
      name,
      isDisabled: false,
      encryptedKeyMaterial,
      encryptionAlgorithm: SymmetricKeyAlgorithm.AES_GCM_256,
      version: 1
    });
  }

  static restore(props: TKmsKeyProps): KmsKey {
    return new KmsKey(props);
  }

  get id() {
    return this.props.id;
  }

  get orgId() {
    return this.props.orgId;
  }

  get name() {
    return this.props.name;
  }

  get isDisabled() {
    return this.props.isDisabled;
  }

  get encryptedKeyMaterial() {
    return this.props.encryptedKeyMaterial;
  }

  assertCanEncrypt() {
    if (this.props.isDisabled) {
      throw new BadRequestError({ message: `KMS key "${this.props.name}" is disabled` });
    }
  }

  disable() {
    this.props.isDisabled = true;
  }

  toProps(): TKmsKeyProps {
    return {
      id: this.props.id,
      orgId: this.props.orgId,
      name: this.props.name,
      isDisabled: this.props.isDisabled,
      encryptedKeyMaterial: this.props.encryptedKeyMaterial,
      encryptionAlgorithm: this.props.encryptionAlgorithm,
      version: this.props.version
    };
  }
}
