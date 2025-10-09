import { Knex } from "knex";

import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { TSshHostLoginUserMappingDALFactory } from "@app/ee/services/ssh-host/ssh-host-login-user-mapping-dal";
import { TSshHostLoginUserDALFactory } from "@app/ee/services/ssh-host/ssh-login-user-dal";
import { TProjectPermission } from "@app/lib/types";
import { ActorAuthMethod } from "@app/services/auth/auth-type";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TGroupDALFactory } from "../group/group-dal";

export type TListSshHostsDTO = Omit<TProjectPermission, "projectId">;

export type TLoginMapping = {
  loginUser: string;
  allowedPrincipals: {
    usernames?: string[];
    groups?: string[];
  };
};

export enum LoginMappingSource {
  HOST = "host",
  HOST_GROUP = "hostGroup"
}

export type TCreateSshHostDTO = {
  hostname: string;
  alias?: string;
  userCertTtl: string;
  hostCertTtl: string;
  loginMappings: TLoginMapping[];
  userSshCaId?: string;
  hostSshCaId?: string;
} & TProjectPermission;

export type TUpdateSshHostDTO = {
  sshHostId: string;
  hostname?: string;
  alias?: string;
  userCertTtl?: string;
  hostCertTtl?: string;
  loginMappings?: TLoginMapping[];
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
  loginMappings: TLoginMapping[];
  sshHostLoginUserDAL: Pick<TSshHostLoginUserDALFactory, "create" | "transaction">;
  sshHostLoginUserMappingDAL: Pick<TSshHostLoginUserMappingDALFactory, "insertMany">;
  userDAL: Pick<TUserDALFactory, "find">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "checkGroupProjectPermission">;
  groupDAL: Pick<TGroupDALFactory, "findGroupsByProjectId">;
  projectId: string;
  actorAuthMethod: ActorAuthMethod;
  actorOrgId: string;
  tx?: Knex;
};

export type TCreateSshLoginMappingsDTO =
  | (BaseCreateSshLoginMappingsDTO & { sshHostId: string; sshHostGroupId?: undefined })
  | (BaseCreateSshLoginMappingsDTO & { sshHostGroupId: string; sshHostId?: undefined });
