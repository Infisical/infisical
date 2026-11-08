// Fixed so a concurrent seed is a primary key conflict rather than a second row.
export const KMS_LEGACY_ENCRYPTION_KEY_UUID = "00000000-0000-0000-0000-000000000001";

export type TLegacyEncryptionKeyProps = {
  id: string;
  // The legacy tier's env keys, encrypted with the root key.
  encryptedKeySnapshot: Buffer;
};

// The env keys of the pre-KMS tier, snapshotted under the root key so rotating the env key cannot strand its rows.
export class LegacyEncryptionKey {
  private constructor(private readonly props: TLegacyEncryptionKeyProps) {}

  static create(encryptedKeySnapshot: Buffer): LegacyEncryptionKey {
    return new LegacyEncryptionKey({ id: KMS_LEGACY_ENCRYPTION_KEY_UUID, encryptedKeySnapshot });
  }

  static restore(props: TLegacyEncryptionKeyProps): LegacyEncryptionKey {
    return new LegacyEncryptionKey(props);
  }

  get encryptedKeySnapshot(): Buffer {
    return this.props.encryptedKeySnapshot;
  }

  toJSON(): TLegacyEncryptionKeyProps {
    return this.props;
  }
}
