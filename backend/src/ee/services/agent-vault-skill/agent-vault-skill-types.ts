import { TGenericPermission } from "@app/lib/types";

export enum AgentVaultSkillFileMode {
  Regular = "0644",
  Executable = "0755"
}

export type TAgentVaultSkillFile = { path: string; mode: AgentVaultSkillFileMode; contentBase64: string };

export type TAgentVaultSkillScoped = { projectId: string; ctx: TGenericPermission };

export type TCreateSkillDTO = TAgentVaultSkillScoped & { files: TAgentVaultSkillFile[] };

export type TListSkillsDTO = TAgentVaultSkillScoped & {
  search?: string;
  name?: string;
  limit: number;
  offset: number;
};

export type TSkillByIdDTO = TAgentVaultSkillScoped & { skillId: string };

export type TUpdateSkillDTO = TSkillByIdDTO & { files: TAgentVaultSkillFile[]; baseVersion?: number };

export type TSkillVersionDTO = TSkillByIdDTO & { version: number };

export type TBundleSkillsDTO = TAgentVaultSkillScoped & { accessBundleId: string };

export type TBundleSkillDTO = TBundleSkillsDTO & { skillId: string };

export type TAgentVaultSkill = {
  id: string;
  name: string;
  description: string;
  latestVersion: number;
  createdAt: Date;
  updatedAt: Date;
};

export type TAgentVaultSkillBundleRef = { id: string; name: string };

export type TAgentVaultSkillWithBundles = TAgentVaultSkill & { accessBundles: TAgentVaultSkillBundleRef[] };

export type TAgentVaultSkillVersion = {
  id: string;
  version: number;
  sha256: string;
  sizeBytes: number;
  fileCount: number;
  createdAt: Date;
};

export type TAgentVaultBundleSkill = { id: string; name: string; description: string; latestVersion: number };
