import { ProjectType } from "@app/db/schemas";
import { TReadOptions } from "@app/domains/lib/data-access";
import { TStoreLocks } from "@app/domains/lib/transactions";
import { TIdentityOwnership } from "@app/domains/platform/organizations/ce/module";

export type TProjectStore = {
  countWorkspaces(orgId: string, options?: TReadOptions): Promise<number>;
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
