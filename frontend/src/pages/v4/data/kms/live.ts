import {
  useBulkExportCmekPrivateKeys,
  useBulkImportCmekKeys,
  useCmekDecrypt,
  useCmekEncrypt,
  useCmekGenerateMac,
  useCmekSign,
  useCmekVerify,
  useCmekVerifyMac,
  useCreateCmek,
  useDeleteCmek,
  useRotateCmek,
  useUpdateCmek
} from "@app/hooks/api/cmeks/mutations";
import {
  useGetCmekPrivateKey,
  useGetCmekPublicKey,
  useGetCmeksByProjectId
} from "@app/hooks/api/cmeks/queries";

import type { KmsAdapter } from "./contract";

export const kmsLive: KmsAdapter = {
  useKeys: useGetCmeksByProjectId,
  useCreateKey: useCreateCmek,
  useUpdateKey: useUpdateCmek,
  useRotateKey: useRotateCmek,
  useDeleteKey: useDeleteCmek,
  useEncrypt: useCmekEncrypt,
  useDecrypt: useCmekDecrypt,
  useSign: useCmekSign,
  useVerify: useCmekVerify,
  useGenerateMac: useCmekGenerateMac,
  useVerifyMac: useCmekVerifyMac,
  usePublicKey: (keyId, options) => useGetCmekPublicKey(keyId, options),
  usePrivateKey: (keyId, options) => useGetCmekPrivateKey(keyId, options),
  useBulkExport: useBulkExportCmekPrivateKeys,
  useBulkImport: useBulkImportCmekKeys
};
