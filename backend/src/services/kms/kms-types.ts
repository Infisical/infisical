export type TGenerateKMSDTO = {
  scopeType: "project" | "org";
  scopeId: string;
  isReserved?: boolean;
};

export type TEncryptWithKmsDTO = {
  kmsId: string;
  plainText: Buffer;
};

export type TDecryptWithKmsDTO = {
  kmsId: string;
  cipherTextBlob: Buffer;
};
