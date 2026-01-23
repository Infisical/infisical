import { TProjects } from "@app/db/schemas/projects";
import { TTrustedIps } from "@app/db/schemas/trusted-ips";
import { TProjectPermission } from "@app/lib/types";

export type TCreateIpDTO = TProjectPermission & {
  comment: string;
  isActive?: boolean;
  ipAddress: string;
};

export type TUpdateIpDTO = TProjectPermission & {
  trustedIpId: string;
  ipAddress: string;
  comment: string;
};

export type TDeleteIpDTO = TProjectPermission & {
  trustedIpId: string;
};

export type TTrustedIpServiceFactory = {
  listIpsByProjectId: (arg: TProjectPermission) => Promise<TTrustedIps[]>;
  addProjectIp: (arg: TCreateIpDTO) => Promise<{
    trustedIp: TTrustedIps;
    project: TProjects;
  }>;
  updateProjectIp: (arg: TUpdateIpDTO) => Promise<{
    trustedIp: TTrustedIps;
    project: TProjects;
  }>;
  deleteProjectIp: (arg: TDeleteIpDTO) => Promise<{
    trustedIp: TTrustedIps;
    project: TProjects;
  }>;
};
