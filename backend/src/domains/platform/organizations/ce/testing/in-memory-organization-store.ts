import type { TActorOrg } from "@app/domains/lib/actor-context";

import { TOrganization, TOrganizationStore } from "../services/dependencies";

// Behaves like OrganizationStore over the orgs a test adds. A sub-org carries its root's sign-in policy, as the
// store reads it.
export class InMemoryOrganizationStore implements TOrganizationStore {
  private readonly orgs = new Map<string, TActorOrg & { slug: string }>();

  add(org: TActorOrg, slug = `org-${org.id}`): void {
    this.orgs.set(org.id, { ...org, ssoPolicy: { ...org.ssoPolicy }, slug });
  }

  async findRootOrgId(orgId: string): Promise<string | null> {
    return this.orgs.get(orgId)?.rootOrgId ?? null;
  }

  async findById(orgId: string): Promise<TOrganization | null> {
    const org = this.orgs.get(orgId);
    return org ? { id: org.id, name: org.name, slug: org.slug } : null;
  }

  async findActorOrg(orgId: string): Promise<TActorOrg | null> {
    const org = this.orgs.get(orgId);
    if (!org) return null;
    const { slug: _slug, ...actorOrg } = org;
    const root = this.orgs.get(org.rootOrgId) ?? org;
    return { ...actorOrg, ssoPolicy: { ...root.ssoPolicy } };
  }
}
