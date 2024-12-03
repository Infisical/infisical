import { TProjectPermission } from "@app/lib/types";

export type TCreateSshCertTemplateDTO = {
  sshCaId: string;
  name: string;
  ttl: string;
  maxTTL: string;
  allowUserCertificates: boolean;
  allowHostCertificates: boolean;
  allowedUsers: string[];
  allowedHosts: string[];
  allowCustomKeyIds: boolean;
} & Omit<TProjectPermission, "projectId">;

export type TUpdateSshCertTemplateDTO = {
  id: string;
  name?: string;
  ttl?: string;
  maxTTL?: string;
  allowUserCertificates?: boolean;
  allowHostCertificates?: boolean;
  allowedUsers?: string[];
  allowedHosts?: string[];
  allowCustomKeyIds?: boolean;
} & Omit<TProjectPermission, "projectId">;

export type TGetSshCertTemplateDTO = {
  id: string;
} & Omit<TProjectPermission, "projectId">;

export type TDeleteSshCertTemplateDTO = {
  id: string;
} & Omit<TProjectPermission, "projectId">;
