import type { TActorOrg } from "@app/domains/lib/actor-context";

import {
  TListRootOrganizationsQuery,
  TOrganization,
  TOrganizationName,
  TOrganizationPage,
  TOrganizationStore
} from "../services/dependencies";

const toName = (org: TActorOrg): TOrganizationName => ({
  id: org.id,
  name: org.name,
  rootOrgId: org.rootOrgId === org.id ? null : org.rootOrgId
});

// Sub-orgs get their root's sign-in policy, same as the real store.
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

  async listOrgTreeNames(orgId: string): Promise<TOrganizationName[]> {
    const org = this.orgs.get(orgId);
    if (!org) return [];
    return [...this.orgs.values()].filter((candidate) => candidate.rootOrgId === org.rootOrgId).map(toName);
  }

  async listAllOrgNames(): Promise<TOrganizationName[]> {
    return [...this.orgs.values()].map(toName);
  }

  async listRootOrganizations(query: TListRootOrganizationsQuery): Promise<TOrganizationPage> {
    const term = query.search?.toLowerCase();
    const matches = [...this.orgs.values()]
      .filter((org) => org.rootOrgId === org.id)
      .filter((org) => !term || org.name.toLowerCase().includes(term) || org.slug.toLowerCase().includes(term))
      .sort((a, b) => a.name.localeCompare(b.name));
    return {
      organizations: matches
        .slice(query.offset, query.offset + query.limit)
        .map((org) => ({ id: org.id, name: org.name, slug: org.slug })),
      totalCount: matches.length
    };
  }
}
