export type TEncryptWithKmsDTO = {
  kmsId: string;
  // utf8 encoded
  plainText: string;
};

export type TDecryptWithKmsDTO = {
  kmsId: string;
  cipherTextBlob: Buffer;
};
