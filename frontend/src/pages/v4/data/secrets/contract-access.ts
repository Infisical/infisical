import type {
  TCreateIdentityFolderAccessDTO,
  TCreateUserFolderAccessDTO,
  TDeleteIdentityFolderAccessDTO,
  TDeleteUserFolderAccessDTO,
  TIdentityFolderAccess,
  TListFolderAccessActorsDTO,
  TListFolderAccessIdentitiesResponse,
  TListFolderAccessUsersResponse,
  TListIdentityFolderAccessDTO,
  TListUserFolderAccessDTO,
  TUpdateIdentityFolderAccessDTO,
  TUpdateUserFolderAccessDTO,
  TUserFolderAccess
} from "@app/hooks/api/folderAccess/types";

import type { V4Mutation, V4QueryResult } from "../contract";

export type SecretsAccessAdapter = {
  useFolderAccessUsers: (
    dto: TListFolderAccessActorsDTO
  ) => V4QueryResult<TListFolderAccessUsersResponse>;
  useFolderAccessIdentities: (
    dto: TListFolderAccessActorsDTO
  ) => V4QueryResult<TListFolderAccessIdentitiesResponse>;
  useUserFolderAccess: (
    dto: TListUserFolderAccessDTO & { enabled?: boolean }
  ) => V4QueryResult<TUserFolderAccess[]>;
  useIdentityFolderAccess: (
    dto: TListIdentityFolderAccessDTO & { enabled?: boolean }
  ) => V4QueryResult<TIdentityFolderAccess[]>;
  useCreateUserFolderAccess: V4Mutation<TCreateUserFolderAccessDTO>;
  useUpdateUserFolderAccess: V4Mutation<TUpdateUserFolderAccessDTO>;
  useDeleteUserFolderAccess: V4Mutation<TDeleteUserFolderAccessDTO>;
  useCreateIdentityFolderAccess: V4Mutation<TCreateIdentityFolderAccessDTO>;
  useUpdateIdentityFolderAccess: V4Mutation<TUpdateIdentityFolderAccessDTO>;
  useDeleteIdentityFolderAccess: V4Mutation<TDeleteIdentityFolderAccessDTO>;
};
