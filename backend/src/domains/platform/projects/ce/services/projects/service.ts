import { ProjectType } from "@app/db/schemas";
import { TTransaction, TTransactionRunner } from "@app/domains/lib/transactions";
import { TIdentityOwnership } from "@app/domains/platform/organizations/ce/module";

import { TProjectIdentityStore, TProjectsStores, TProjectStore } from "../dependencies";
import { ProjectsTransaction, TProjectsTransaction } from "./projects-transaction";

export type TProjectsService = {
  // Includes sub-orgs.
  countWorkspaces(orgId: string): Promise<number>;
  countProjectIdentities(projectType: ProjectType, orgId: string | null): Promise<number>;
  countProjectIdentitiesByKind(
    projectType: ProjectType,
    orgId?: string
  ): Promise<{ users: number; identities: number }>;
  getProjectIdentityBreakdown(projectType: ProjectType, orgId?: string): Promise<TIdentityOwnership[]>;
  // Joins the caller's transaction. Only for a limit check that must be atomic with the write it guards.
  within(tx: TTransaction): TProjectsTransaction;
};

export class ProjectsService implements TProjectsService {
  constructor(
    private readonly projectStore: TProjectStore,
    private readonly projectIdentityStore: TProjectIdentityStore,
    private readonly transactionRunner: TTransactionRunner<TProjectsStores>
  ) {}

  countWorkspaces(orgId: string): Promise<number> {
    return this.projectStore.countWorkspaces(orgId);
  }

  countProjectIdentities(projectType: ProjectType, orgId: string | null) {
    return this.projectIdentityStore.countProjectIdentities(projectType, orgId);
  }

  countProjectIdentitiesByKind(projectType: ProjectType, orgId?: string) {
    return this.projectIdentityStore.countProjectIdentitiesByKind(projectType, orgId);
  }

  getProjectIdentityBreakdown(projectType: ProjectType, orgId?: string) {
    return this.projectIdentityStore.getProjectIdentityOwnershipBreakdown(projectType, orgId);
  }

  within(tx: TTransaction): TProjectsTransaction {
    return new ProjectsTransaction(this.transactionRunner.within(tx));
  }
}
