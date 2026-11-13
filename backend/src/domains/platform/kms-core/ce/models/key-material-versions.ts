import { InternalKeyMaterial } from "./internal-key-material";
import { KeyMaterial, KmsKeyUsage } from "./key-material";
import { KmsCiphertext } from "./kms-ciphertext";
import { KmsCiphertextUndecryptableError } from "./kms-ciphertext-undecryptable-error";
import { KmsKeyVersion } from "./kms-key-version";
import { RootKey } from "./root-key";

type TVersionSource = InternalKeyMaterial | KmsKeyVersion;

// The material versions of one internal key and the order a ciphertext is tried against them. Archived versions are
// optional: most keys never rotate and most ciphertext is current, so the caller loads them only after a miss.
export class KeyMaterialVersions {
  private constructor(
    private readonly rootKey: RootKey,
    private readonly current: InternalKeyMaterial,
    private readonly archived: readonly KmsKeyVersion[] | null,
    // Unwrapped material per version, kept so one decryptor unwraps each version once.
    private readonly opened: Map<TVersionSource, KeyMaterial>
  ) {}

  static of(rootKey: RootKey, current: InternalKeyMaterial, archived?: readonly KmsKeyVersion[]): KeyMaterialVersions {
    return new KeyMaterialVersions(rootKey, current, archived ?? null, new Map());
  }

  get hasArchived(): boolean {
    return this.archived !== null;
  }

  withArchived(archived: readonly KmsKeyVersion[]): KeyMaterialVersions {
    return new KeyMaterialVersions(this.rootKey, this.current, archived, this.opened);
  }

  // Null when no known version decrypts it. An unwrap failure is not a miss: it means the stored material is
  // damaged, so it propagates.
  tryDecrypt(ciphertext: KmsCiphertext): Buffer<ArrayBuffer> | null {
    for (const source of this.candidates(ciphertext.keyVersion)) {
      const material = this.material(source);
      try {
        return material.decrypt(ciphertext.cipherText);
      } catch {
        // Authentication failed under this version; the next one may match.
      }
    }
    return null;
  }

  // The last resort fails because of the ciphertext, not the stored material, so it gets its own error type.
  decryptOrThrow(ciphertext: KmsCiphertext): Buffer<ArrayBuffer> {
    const decrypted = this.tryDecrypt(ciphertext);
    if (decrypted) return decrypted;
    try {
      return this.material(this.current).decrypt(ciphertext.cipherText);
    } catch (error) {
      throw new KmsCiphertextUndecryptableError(error);
    }
  }

  // The version a v02 blob names first, then the current one (which also covers rotated material re-imported as
  // version 1), then archived versions newest first.
  private candidates(named: number | null): TVersionSource[] {
    const archived = [...(this.archived ?? [])].sort((a, b) => b.version - a.version);
    const ordered: TVersionSource[] = [this.current, ...archived];
    const namedIndex = named === null ? -1 : ordered.findIndex((source) => source.version === named);
    if (namedIndex <= 0) return ordered;
    const [namedSource] = ordered.splice(namedIndex, 1);
    return [namedSource, ...ordered];
  }

  private material(source: TVersionSource): KeyMaterial {
    const known = this.opened.get(source);
    if (known) return known;
    const opened =
      source instanceof InternalKeyMaterial
        ? source.open(this.rootKey, KmsKeyUsage.ENCRYPT_DECRYPT)
        : source.open(this.rootKey, this.current.algorithm);
    this.opened.set(source, opened);
    return opened;
  }
}
