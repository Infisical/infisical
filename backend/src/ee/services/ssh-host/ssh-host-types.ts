import { Knex } from "knex";

import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { TSshHostLoginUserMappingDALFactory } from "@app/ee/services/ssh-host/ssh-host-login-user-mapping-dal";
import { TSshHostLoginUserDALFactory } from "@app/ee/services/ssh-host/ssh-login-user-dal";
import { TProjectPermission } from "@app/lib/types";
import { ActorAuthMethod } from "@app/services/auth/auth-type";
import { TUserDALFactory } from "@app/services/user/user-dal";

export type TListSshHostsDTO = Omit<TProjectPermission, "projectId">;

type LoginMapping = {
  loginUser: string;
  allowedPrincipals: {
    usernames: string[];
  };
};

export type TCreateSshHostDTO = {
  hostname: string;
  alias?: string;
  userCertTtl: string;
  hostCertTtl: string;
  loginMappings: LoginMapping[];
  userSshCaId?: string;
  hostSshCaId?: string;
} & TProjectPermission;

export type TUpdateSshHostDTO = {
  sshHostId: string;
  hostname?: string;
  alias?: string;
  userCertTtl?: string;
  hostCertTtl?: string;
  loginMappings?: LoginMapping[];
} & Omit<TProjectPermission, "projectId">;

export type TGetSshHostDTO = {
  sshHostId: string;
} & Omit<TProjectPermission, "projectId">;

export type TDeleteSshHostDTO = {
  sshHostId: string;
} & Omit<TProjectPermission, "projectId">;

export type TIssueSshHostUserCertDTO = {
  sshHostId: string;
  loginUser: string;
} & Omit<TProjectPermission, "projectId">;

export type TIssueSshHostHostCertDTO = {
  sshHostId: string;
  publicKey: string;
} & Omit<TProjectPermission, "projectId">;

type BaseCreateSshLoginMappingsDTO = {
  loginMappings: LoginMapping[];
  sshHostLoginUserDAL: Pick<TSshHostLoginUserDALFactory, "create" | "transaction">;
  sshHostLoginUserMappingDAL: Pick<TSshHostLoginUserMappingDALFactory, "insertMany">;
  userDAL: Pick<TUserDALFactory, "find">;
  permissionService: Pick<TPermissionServiceFactory, "getUserProjectPermission">;
  projectId: string;
  actorAuthMethod: ActorAuthMethod;
  actorOrgId: string;
  tx?: Knex;
};

export type TCreateSshLoginMappingsDTO =
  | (BaseCreateSshLoginMappingsDTO & { sshHostId: string; sshHostGroupId?: undefined })
  | (BaseCreateSshLoginMappingsDTO & { sshHostGroupId: string; sshHostId?: undefined });
