import { RuleViolationError } from "@app/domains/lib/errors";

import { DefaultAuthOrg, TDefaultAuthOrgRecord } from "./default-auth-org";

// Field names match the super_admin row, so restore() takes the row as it is.
export type TLoginPolicyRecord = TDefaultAuthOrgRecord & {
  enabledLoginMethods?: string[] | null;
  trustLdapEmails?: boolean | null;
};

// How users log in: the methods enabled instance-wide (null is all of them), whether LDAP logins skip email
// verification, and the default auth org.
export class LoginPolicy {
  private constructor(
    private readonly enabledLoginMethods: readonly string[] | null,
    private readonly trustLdapEmails: boolean | null,
    private readonly defaultAuthOrg: DefaultAuthOrg
  ) {}

  static restore(record: TLoginPolicyRecord): LoginPolicy {
    return new LoginPolicy(
      record.enabledLoginMethods ?? null,
      record.trustLdapEmails ?? null,
      DefaultAuthOrg.restore(record)
    );
  }

  changeLoginMethods(methods: string[]): LoginPolicy {
    if (methods.length === 0) {
      throw new RuleViolationError({ message: "At least one login method should be enabled." });
    }
    return new LoginPolicy([...methods], this.trustLdapEmails, this.defaultAuthOrg);
  }

  changeTrustLdapEmails(trust: boolean): LoginPolicy {
    return new LoginPolicy(this.enabledLoginMethods, trust, this.defaultAuthOrg);
  }

  changeDefaultAuthOrg(orgId: string | null): LoginPolicy {
    return new LoginPolicy(this.enabledLoginMethods, this.trustLdapEmails, this.defaultAuthOrg.select(orgId));
  }

  toJSON(): Required<TLoginPolicyRecord> {
    return {
      enabledLoginMethods: this.enabledLoginMethods ? [...this.enabledLoginMethods] : null,
      trustLdapEmails: this.trustLdapEmails,
      ...this.defaultAuthOrg.toJSON()
    };
  }
}
