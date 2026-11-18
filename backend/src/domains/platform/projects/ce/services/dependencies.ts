import { ProjectType } from "@app/db/schemas";
import { TReadOptions } from "@app/domains/lib/data-access";
import { TStoreLocks } from "@app/domains/lib/transactions";
import { TIdentityOwnership } from "@app/domains/platform/organizations/ce/module";

import { Project } from "../models/project";

export type TProjectStore = {
  countWorkspaces(orgId: string, options?: TReadOptions): Promise<number>;
  findById(projectId: string, options?: TReadOptions): Promise<Project | null>;
  // When the project is scheduled for deletion, or "" when it is not.
  findDeletionState(projectId: string, options?: TReadOptions): Promise<string>;
};

export type TProjectCache = {
  // The project, from the cache while its deletion state is unchanged, otherwise loaded.
  getOrLoad(input: {
    projectId: string;
    fingerprint: () => Promise<string>;
    load: () => Promise<Project>;
  }): Promise<Project>;
};

// The users and identities in a product's projects, which that product's usage meter bills. Null orgId = whole
// instance.
export type TProjectIdentityStore = {
  countProjectIdentities(projectType: ProjectType, orgId: string | null, options?: TReadOptions): Promise<number>;
  countProjectIdentitiesByKind(
    projectType: ProjectType,
    orgId?: string,
    options?: TReadOptions
  ): Promise<{ users: number; identities: number }>;
  getProjectIdentityOwnershipBreakdown(
    projectType: ProjectType,
    orgId?: string,
    options?: TReadOptions
  ): Promise<TIdentityOwnership[]>;
};

export type TProjectsStores = {
  projectStore: TProjectStore;
  projectIdentityStore: TProjectIdentityStore;
  locks: TStoreLocks;
};
