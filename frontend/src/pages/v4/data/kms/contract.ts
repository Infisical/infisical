import type {
  TCmek,
  TCreateCmek,
  TDeleteCmek,
  TListProjectCmeksDTO,
  TProjectCmeksList,
  TRotateCmek,
  TUpdateCmek
} from "@app/hooks/api/cmeks/types";

import type { V4Mutation, V4QueryResult } from "../contract";

export type KmsAdapter = {
  useKeys: (dto: TListProjectCmeksDTO) => V4QueryResult<TProjectCmeksList>;
  useCreateKey: V4Mutation<TCreateCmek, TCmek>;
  useUpdateKey: V4Mutation<TUpdateCmek>;
  useRotateKey: V4Mutation<TRotateCmek>;
  useDeleteKey: V4Mutation<TDeleteCmek>;
};
