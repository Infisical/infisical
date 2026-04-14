import { ActorAuthMethod, ActorType } from "@app/services/auth/auth-type";

export enum ScepMessageType {
  CertRep = "3",
  RenewalReq = "17",
  PKCSReq = "19",
  GetCertInitial = "20"
}

export enum ScepPkiStatus {
  SUCCESS = "0",
  FAILURE = "2",
  PENDING = "3"
}

export enum ScepFailInfo {
  BadAlg = "0",
  BadMessageCheck = "1",
  BadRequest = "2",
  BadTime = "3",
  BadCertId = "4"
}

export const SCEP_OIDS = {
  transactionId: "2.16.840.1.113733.1.9.7",
  messageType: "2.16.840.1.113733.1.9.2",
  pkiStatus: "2.16.840.1.113733.1.9.3",
  failInfo: "2.16.840.1.113733.1.9.4",
  senderNonce: "2.16.840.1.113733.1.9.5",
  recipientNonce: "2.16.840.1.113733.1.9.6"
} as const;

export const DIGEST_OID_TO_HASH: Record<string, string> = {
  "2.16.840.1.101.3.4.2.1": "sha256",
  "1.3.14.3.2.26": "sha1",
  "2.16.840.1.101.3.4.2.2": "sha384",
  "2.16.840.1.101.3.4.2.3": "sha512"
};

export const CIPHER_OID_MAP: Record<string, { algorithm: string; keyLength: number; ivLength: number }> = {
  "2.16.840.1.101.3.4.1.2": { algorithm: "aes-128-cbc", keyLength: 16, ivLength: 16 }, // AES-128-CBC
  "2.16.840.1.101.3.4.1.42": { algorithm: "aes-256-cbc", keyLength: 32, ivLength: 16 }, // AES-256-CBC
  "1.2.840.113549.3.7": { algorithm: "des-ede3-cbc", keyLength: 24, ivLength: 8 } // 3DES-CBC (DES-EDE3-CBC)
};

export interface TParsedScepMessage {
  messageType: ScepMessageType;
  transactionId: string;
  senderNonce: Buffer;
  signerCertDer: Buffer;
  csr?: Buffer;
  clientCipherOid?: string;
}

export type TGetCaCapsDTO = {
  profileId: string;
};

export type TGetCaCertDTO = {
  profileId: string;
};

export type THandlePkiOperationDTO = {
  profileId: string;
  message: Buffer;
  clientIp: string;
};

export type TGenerateDynamicChallengeDTO = {
  profileId: string;
  clientIp: string;
  actor: ActorType;
  actorId: string;
  actorAuthMethod: ActorAuthMethod;
  actorOrgId: string;
};
