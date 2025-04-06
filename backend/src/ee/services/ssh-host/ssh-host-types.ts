import { TProjectPermission } from "@app/lib/types";

export type TCreateSshHostDTO = {
  hostname: string;
  userCertTtl: string;
  hostCertTtl: string;
  loginMappings: {
    loginUser: string;
    allowedPrincipals: string[];
  }[];
} & TProjectPermission;

export type TUpdateSshHostDTO = {
  sshHostId: string;
  hostname?: string;
  userCertTtl?: string;
  hostCertTtl?: string;
  loginMappings?: {
    loginUser: string;
    allowedPrincipals: string[];
  }[];
} & Omit<TProjectPermission, "projectId">;

export type TGetSshHostDTO = {
  sshHostId: string;
} & Omit<TProjectPermission, "projectId">;

export type TDeleteSshHostDTO = {
  sshHostId: string;
} & Omit<TProjectPermission, "projectId">;
