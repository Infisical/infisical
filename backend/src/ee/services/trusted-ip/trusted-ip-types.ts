import { TProjects, TTrustedIps } from "@app/db/schemas";
import { TActorInput } from "@app/lib/types";

type TTrustedIpProjectDTO = { projectId: string } & TActorInput;

export type TCreateIpDTO = TTrustedIpProjectDTO & {
  comment: string;
  isActive?: boolean;
  ipAddress: string;
};

export type TUpdateIpDTO = TTrustedIpProjectDTO & {
  trustedIpId: string;
  ipAddress: string;
  comment: string;
};

export type TDeleteIpDTO = TTrustedIpProjectDTO & {
  trustedIpId: string;
};

export type TTrustedIpServiceFactory = {
  listIpsByProjectId: (arg: TTrustedIpProjectDTO) => Promise<TTrustedIps[]>;
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
