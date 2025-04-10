import { TProjectPermission } from "@app/lib/types";

export type TListSshHostsDTO = Omit<TProjectPermission, "projectId">;

export type TCreateSshHostDTO = {
  hostname: string;
  userCertTtl: string;
  hostCertTtl: string;
  loginMappings: {
    loginUser: string;
    allowedPrincipals: {
      usernames: string[];
    };
  }[];
  userSshCaId?: string;
  hostSshCaId?: string;
} & TProjectPermission;

export type TUpdateSshHostDTO = {
  sshHostId: string;
  hostname?: string;
  userCertTtl?: string;
  hostCertTtl?: string;
  loginMappings?: {
    loginUser: string;
    allowedPrincipals: {
      usernames: string[];
    };
  }[];
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
