import { randomUUID } from "node:crypto";

export type TKmsKeyVersionProps = {
  id: string;
  internalKmsId: string;
  encryptedKey: Buffer;
  version: number;
};

// Material a rotation replaced. Never deleted, so ciphertext written under it stays readable.
export class KmsKeyVersion {
  private constructor(private readonly props: TKmsKeyVersionProps) {}

  static create(input: Omit<TKmsKeyVersionProps, "id">): KmsKeyVersion {
    return new KmsKeyVersion({ id: randomUUID(), ...input });
  }

  static restore(props: TKmsKeyVersionProps): KmsKeyVersion {
    return new KmsKeyVersion(props);
  }

  get internalKmsId(): string {
    return this.props.internalKmsId;
  }

  get version(): number {
    return this.props.version;
  }

  get encryptedKey(): Buffer {
    return this.props.encryptedKey;
  }

  toJSON(): TKmsKeyVersionProps {
    return this.props;
  }
}
