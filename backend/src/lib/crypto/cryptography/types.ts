import { SecretEncryptionAlgo, SecretKeyEncoding } from "@app/db/schemas/models";

export enum DigestType {
  Hex = "hex",
  Base64 = "base64"
}

export enum SymmetricKeySize {
  Bits128 = "128-bits",
  Bits256 = "256-bits"
}

export type TDecryptSymmetricInput =
  | {
      ciphertext: string;
      iv: string;
      tag: string;
      key: string | Buffer; // can be hex encoded or buffer
      keySize: SymmetricKeySize.Bits128;
    }
  | {
      ciphertext: string;
      iv: string;
      tag: string;
      key: string; // must be base64 encoded
      keySize: SymmetricKeySize.Bits256;
    };

export type TEncryptSymmetricInput =
  | {
      plaintext: string;
      key: string;
      keySize: SymmetricKeySize.Bits256;
    }
  | {
      plaintext: string;
      key: string | Buffer;
      keySize: SymmetricKeySize.Bits128;
    };

export type TDecryptAsymmetricInput = {
  ciphertext: string;
  nonce: string;
  publicKey: string;
  privateKey: string;
};

export type TEncryptedWithRootEncryptionKey = {
  iv: string;
  tag: string;
  ciphertext: string;
  algorithm: SecretEncryptionAlgo;
  encoding: SecretKeyEncoding;
};
