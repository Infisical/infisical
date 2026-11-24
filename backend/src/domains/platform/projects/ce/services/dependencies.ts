import { ProjectType } from "@app/db/schemas";
import { TReadOptions } from "@app/domains/lib/data-access";
import { TStoreLocks } from "@app/domains/lib/transactions";
import type { ActorGrants } from "@app/domains/platform/access-control/ce/module";
import { TIdentityOwnership } from "@app/domains/platform/organizations/ce/module";

import { Project } from "../models/project";

// Told about each actor's access to a project as it is resolved, nested checks included, for the request's audit
// context; the domains never touch the request themselves.
export type TProjectAccessListener = (access: { project: Project; grants: ActorGrants }) => void;

export type TProjectStore = {
  countWorkspaces(orgId: string, options?: TReadOptions): Promise<number>;
  findById(projectId: string, options?: TReadOptions): Promise<Project | null>;
  // Changes whenever the project row does (a setting, a scheduled deletion) and reads "missing" when it is gone, so
  // a cached project is replaced within the cache's check interval.
  findVersion(projectId: string, options?: TReadOptions): Promise<string>;
};

export type TProjectCache = {
  // The project, from the cache while its version is unchanged, otherwise loaded.
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
