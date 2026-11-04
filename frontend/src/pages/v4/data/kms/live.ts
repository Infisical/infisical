import {
  useCreateCmek,
  useDeleteCmek,
  useRotateCmek,
  useUpdateCmek
} from "@app/hooks/api/cmeks/mutations";
import { useGetCmeksByProjectId } from "@app/hooks/api/cmeks/queries";

import type { KmsAdapter } from "./contract";

export const kmsLive: KmsAdapter = {
  useKeys: useGetCmeksByProjectId,
  useCreateKey: useCreateCmek,
  useUpdateKey: useUpdateCmek,
  useRotateKey: useRotateCmek,
  useDeleteKey: useDeleteCmek
};
