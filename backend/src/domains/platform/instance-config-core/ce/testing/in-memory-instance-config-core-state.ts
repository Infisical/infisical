import { TSuperAdmin } from "@app/db/schemas";

// An org the config can name as its default auth org. Organizations and SSO configs belong to no domain yet.
export type TInMemoryAuthOrg = { slug: string; authEnforced: boolean | null; authMethod: "saml" | "oidc" | null };

type TTables = { row: TSuperAdmin | null; orgs: Map<string, TInMemoryAuthOrg> };

export class InMemoryInstanceConfigCoreState {
  tables: TTables = { row: null, orgs: new Map() };

  // Counts reads of the row, so a test can tell a cache hit from a database read.
  reads = 0;

  // For tests that need a row the domain would never write, such as a corrupt ciphertext.
  overwriteRow(columns: Partial<TSuperAdmin>) {
    if (!this.tables.row) throw new Error("No instance config row to overwrite");
    this.tables.row = { ...this.tables.row, ...columns };
  }

  addOrg(id: string, org: TInMemoryAuthOrg) {
    this.tables.orgs.set(id, org);
  }

  snapshot(): unknown {
    return { row: this.tables.row, orgs: new Map(this.tables.orgs) } satisfies TTables;
  }

  restore(snapshot: unknown) {
    this.tables = snapshot as TTables;
  }
}
