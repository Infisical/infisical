import type {
  TCmek,
  TCmekBulkExportPrivateKeysDTO,
  TCmekBulkExportPrivateKeysResponse,
  TCmekBulkImportKeysDTO,
  TCmekBulkImportKeysResponse,
  TCmekDecrypt,
  TCmekDecryptResponse,
  TCmekEncrypt,
  TCmekEncryptResponse,
  TCmekGenerateMac,
  TCmekGenerateMacResponse,
  TCmekGetPrivateKeyResponse,
  TCmekGetPublicKeyResponse,
  TCmekSign,
  TCmekSignResponse,
  TCmekVerify,
  TCmekVerifyMac,
  TCmekVerifyMacResponse,
  TCmekVerifyResponse,
  TCreateCmek,
  TDeleteCmek,
  TListProjectCmeksDTO,
  TProjectCmeksList,
  TRotateCmek,
  TUpdateCmek
} from "@app/hooks/api/cmeks/types";

import type { V4Mutation, V4QueryResult } from "../contract";

type Encoded = { isBase64Encoded: boolean };
type KeyMaterialQuery<TData> = (
  keyId: string,
  options: { enabled: boolean }
) => V4QueryResult<TData>;

export type KmsAdapter = {
  useKeys: (dto: TListProjectCmeksDTO) => V4QueryResult<TProjectCmeksList>;
  useCreateKey: V4Mutation<TCreateCmek, TCmek>;
  useUpdateKey: V4Mutation<TUpdateCmek>;
  useRotateKey: V4Mutation<TRotateCmek>;
  useDeleteKey: V4Mutation<TDeleteCmek>;
  useEncrypt: V4Mutation<TCmekEncrypt, TCmekEncryptResponse>;
  useDecrypt: V4Mutation<TCmekDecrypt, TCmekDecryptResponse>;
  useSign: V4Mutation<TCmekSign & Encoded, TCmekSignResponse>;
  useVerify: V4Mutation<TCmekVerify & Encoded, TCmekVerifyResponse>;
  useGenerateMac: V4Mutation<TCmekGenerateMac & Encoded, TCmekGenerateMacResponse>;
  useVerifyMac: V4Mutation<TCmekVerifyMac & Encoded, TCmekVerifyMacResponse>;
  usePublicKey: KeyMaterialQuery<TCmekGetPublicKeyResponse>;
  usePrivateKey: KeyMaterialQuery<TCmekGetPrivateKeyResponse>;
  useBulkExport: V4Mutation<TCmekBulkExportPrivateKeysDTO, TCmekBulkExportPrivateKeysResponse>;
  useBulkImport: V4Mutation<TCmekBulkImportKeysDTO, TCmekBulkImportKeysResponse>;
};
