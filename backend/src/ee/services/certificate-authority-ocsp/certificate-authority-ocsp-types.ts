import { OcspCertStatus } from "./certificate-authority-ocsp-enums";

export type TOcspCertStatus =
  | { kind: OcspCertStatus.Good }
  | { kind: OcspCertStatus.Revoked; revokedAt: Date; reason?: number }
  | { kind: OcspCertStatus.Unknown };

export type TParsedOcspRequestEntry = {
  hashAlgorithmOid: string;
  issuerNameHash: Buffer;
  issuerKeyHash: Buffer;
  rawSerialNumber: string;
  serialNumber: string;
};

export type TParsedOcspRequest = {
  entries: TParsedOcspRequestEntry[];
  nonce?: Buffer;
};

export type TGetOcspResponseDTO = {
  caId: string;
  requestDer: Buffer;
};

export type TOcspResponseResult = {
  response: Buffer;
  maxAgeSeconds: number;
};

export type TCertificateAuthorityOcspServiceFactory = {
  getOcspResponse: (dto: TGetOcspResponseDTO) => Promise<TOcspResponseResult>;
};
