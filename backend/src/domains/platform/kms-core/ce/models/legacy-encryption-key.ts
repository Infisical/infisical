import { TLegacyKeyMaterial, TLegacyKeySnapshot } from "@app/lib/crypto/legacy-key";

import { RootKey } from "./root-key";

// Fixed so a concurrent seed is a primary key conflict rather than a second row.
export const KMS_LEGACY_ENCRYPTION_KEY_UUID = "00000000-0000-0000-0000-000000000001";

export type TLegacyEncryptionKeyRecord = {
  id: string;
  // The legacy tier's env keys, encrypted with the root key.
  encryptedKeySnapshot: Buffer;
};

const hasKey = (snapshot?: TLegacyKeySnapshot): snapshot is TLegacyKeySnapshot =>
  Boolean(snapshot && (snapshot.ENCRYPTION_KEY || snapshot.ROOT_ENCRYPTION_KEY));

// The env keys of the pre-KMS tier, snapshotted under the root key so rotating the env key cannot strand its rows.
export class LegacyEncryptionKey {
  private constructor(
    readonly id: string,
    readonly encryptedKeySnapshot: Buffer
  ) {}

  /**
   * What to snapshot from the environment, or null when there is nothing to keep (pure HSM, no env key: the legacy
   * tier keeps throwing as it does today). `original` is the env before the FIPS relabel, which can drop a key
   * existing rows were written under.
   */
  static materialFromEnv(input: {
    current: TLegacyKeySnapshot;
    original?: TLegacyKeySnapshot;
  }): TLegacyKeyMaterial | null {
    const current: TLegacyKeySnapshot = {
      ENCRYPTION_KEY: input.current.ENCRYPTION_KEY,
      ROOT_ENCRYPTION_KEY: input.current.ROOT_ENCRYPTION_KEY
    };
    const original: TLegacyKeySnapshot | undefined = input.original
      ? { ENCRYPTION_KEY: input.original.ENCRYPTION_KEY, ROOT_ENCRYPTION_KEY: input.original.ROOT_ENCRYPTION_KEY }
      : undefined;
    if (!hasKey(current) && !hasKey(original)) return null;
    return { current, original };
  }

  static create(material: TLegacyKeyMaterial, rootKey: RootKey): LegacyEncryptionKey {
    return new LegacyEncryptionKey(
      KMS_LEGACY_ENCRYPTION_KEY_UUID,
      rootKey.encrypt(Buffer.from(JSON.stringify(material), "utf8"))
    );
  }

  static restore(record: TLegacyEncryptionKeyRecord): LegacyEncryptionKey {
    return new LegacyEncryptionKey(record.id, record.encryptedKeySnapshot);
  }

  open(rootKey: RootKey): TLegacyKeyMaterial {
    return JSON.parse(rootKey.decrypt(this.encryptedKeySnapshot).toString("utf8")) as TLegacyKeyMaterial;
  }

  toJSON(): TLegacyEncryptionKeyRecord {
    return { id: this.id, encryptedKeySnapshot: this.encryptedKeySnapshot };
  }
}
