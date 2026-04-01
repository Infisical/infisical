import { TDbClient } from "@app/db";
import { TableName, TEmailDomains } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TEmailDomainDALFactory = ReturnType<typeof emailDomainDALFactory>;

export const emailDomainDALFactory = (db: TDbClient) => {
  const emailDomainOrm = ormify(db, TableName.EmailDomains);

  // Find all verified subdomains under a parent domain at all nesting levels, excluding the given org
  const findVerifiedSubdomains = async (parentDomain: string, excludeOrgId: string): Promise<TEmailDomains[]> => {
    const results = await db
      .replicaNode()(TableName.EmailDomains)
      .where("status", "verified")
      .where("orgId", "!=", excludeOrgId)
      .andWhere("domain", "like", `%.${parentDomain}`);

    return results;
  };

  // Find all verified parent domains for a given subdomain, excluding the given org
  // E.g., for "a.b.company.com", finds verified records for "b.company.com", "company.com"
  const findVerifiedParentDomains = async (domain: string, excludeOrgId: string): Promise<TEmailDomains[]> => {
    const parts = domain.split(".");
    const parentCandidates: string[] = [];
    for (let i = 1; i < parts.length - 1; i += 1) {
      parentCandidates.push(parts.slice(i).join("."));
    }

    if (parentCandidates.length === 0) return [];

    const results = await db
      .replicaNode()(TableName.EmailDomains)
      .where("status", "verified")
      .where("orgId", "!=", excludeOrgId)
      .whereIn("domain", parentCandidates);

    return results;
  };

  return { ...emailDomainOrm, findVerifiedSubdomains, findVerifiedParentDomains };
};
