export type TEncryptWithKmsDTO = {
  kmsId: string;
  plainText: Buffer;
};

export type TDecryptWithKmsDTO = {
  kmsId: string;
  cipherTextBlob: Buffer;
};
