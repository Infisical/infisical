import { ProjectType } from "@app/db/schemas";
import { TReadOptions } from "@app/domains/lib/data-access";
import { TStoreLocks } from "@app/domains/lib/transactions";
import type { ActorGrants, TGrantActor } from "@app/domains/platform/access-control/ce/module";
import { TIdentityOwnership } from "@app/domains/platform/organizations/ce/module";

import { Project } from "../models/project";

// Fires on every project access as it resolves (nested checks too) to feed the request's audit context, so the
// domains never touch the request themselves.
export type TProjectAccessListener = (access: { project: Project; grants: ActorGrants }) => void;

export type TProjectStore = {
  countWorkspaces(orgId: string, options?: TReadOptions): Promise<number>;
  findById(projectId: string, options?: TReadOptions): Promise<Project | null>;
  // Changes with any row change and reads "missing" once it's gone, so a cached project gets replaced within the
  // cache's check interval.
  findVersion(projectId: string, options?: TReadOptions): Promise<string>;
};

export type TProjectCache = {
  // Cached per actor (like the legacy engine did), so an actor's first request always sees current settings.
  getOrLoad(input: {
    projectId: string;
    actor: TGrantActor;
    fingerprint: () => Promise<string>;
    load: () => Promise<Project>;
  }): Promise<Project>;
};

// Users and identities billed by the product's usage meter. Null orgId means the whole instance.
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
