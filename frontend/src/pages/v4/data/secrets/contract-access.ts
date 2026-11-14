import type {
  TCreateIdentityFolderAccessDTO,
  TCreateUserFolderAccessDTO,
  TDeleteIdentityFolderAccessDTO,
  TDeleteUserFolderAccessDTO,
  TListFolderAccessActorsDTO,
  TListFolderAccessIdentitiesResponse,
  TListFolderAccessUsersResponse,
  TUpdateIdentityFolderAccessDTO,
  TUpdateUserFolderAccessDTO
} from "@app/hooks/api/folderAccess/types";

import type { V4Mutation, V4QueryResult } from "../contract";

export type SecretsAccessAdapter = {
  useHasFolderAccessPlan: (orgId: string) => V4QueryResult<boolean>;
  useFolderAccessUsers: (
    dto: TListFolderAccessActorsDTO
  ) => V4QueryResult<TListFolderAccessUsersResponse>;
  useFolderAccessIdentities: (
    dto: TListFolderAccessActorsDTO
  ) => V4QueryResult<TListFolderAccessIdentitiesResponse>;
  useCreateUserFolderAccess: V4Mutation<TCreateUserFolderAccessDTO>;
  useUpdateUserFolderAccess: V4Mutation<TUpdateUserFolderAccessDTO>;
  useDeleteUserFolderAccess: V4Mutation<TDeleteUserFolderAccessDTO>;
  useCreateIdentityFolderAccess: V4Mutation<TCreateIdentityFolderAccessDTO>;
  useUpdateIdentityFolderAccess: V4Mutation<TUpdateIdentityFolderAccessDTO>;
  useDeleteIdentityFolderAccess: V4Mutation<TDeleteIdentityFolderAccessDTO>;
};
