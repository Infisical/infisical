// Field names match the super_admin row and the fields its read joins in, so restore() takes the row as it is.
export type TDefaultAuthOrgRecord = {
  defaultAuthOrgId?: string | null;
  defaultAuthOrgSlug?: string | null;
  defaultAuthOrgAuthEnforced?: boolean | null;
  defaultAuthOrgAuthMethod?: string | null;
};

// The org whose SSO the login page offers. The slug and SSO fields are joined from the org when the row is read; they
// belong to the org and its SSO configs, so they are read-only here.
export class DefaultAuthOrg {
  private constructor(
    readonly id: string | null,
    private readonly slug: string | null,
    private readonly authEnforced: boolean | null,
    private readonly authMethod: string | null
  ) {}

  static restore(record: TDefaultAuthOrgRecord): DefaultAuthOrg {
    return new DefaultAuthOrg(
      record.defaultAuthOrgId ?? null,
      record.defaultAuthOrgSlug || null,
      record.defaultAuthOrgAuthEnforced ?? null,
      record.defaultAuthOrgAuthMethod ?? null
    );
  }

  // The joined slug and SSO fields describe the previous org until the row is read again.
  select(orgId: string | null): DefaultAuthOrg {
    return new DefaultAuthOrg(orgId, this.slug, this.authEnforced, this.authMethod);
  }

  toJSON(): Required<TDefaultAuthOrgRecord> {
    return {
      defaultAuthOrgId: this.id,
      defaultAuthOrgSlug: this.slug,
      defaultAuthOrgAuthEnforced: this.authEnforced,
      defaultAuthOrgAuthMethod: this.authMethod
    };
  }
}
