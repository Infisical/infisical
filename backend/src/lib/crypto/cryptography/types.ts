import { KeyObject } from "crypto";

import { SecretEncryptionAlgo, SecretKeyEncoding } from "@app/db/schemas";

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

export interface JWTPayload {
  iat?: number;
  exp?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export interface CompleteJWTPayload {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  header: any;
  payload: JWTPayload;
  signature: string;
}

export type Algorithm = "HS256" | "HS384" | "HS512" | "RS256" | "RS384" | "RS512";

export interface JWTSignOptions {
  algorithm?: Algorithm | undefined;
  keyid?: string | undefined;
  expiresIn?: string | number;
}

export type JWTSecretOrKey = string | Buffer | KeyObject | { key: string | Buffer; passphrase: string };

export interface JWTVerifyOptions {
  algorithms?: Algorithm[] | undefined;
  audience?: string | string[];
  issuer?: string | string[];
  subject?: string;
  ignoreExpiration?: boolean;
  ignoreNotBefore?: boolean;
  clockTolerance?: number;
  maxAge?: string | number;
  jwtid?: string;
}
