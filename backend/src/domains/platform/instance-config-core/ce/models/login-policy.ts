import { RuleViolationError } from "@app/domains/lib/errors";

import { DefaultAuthOrg, TDefaultAuthOrgRecord } from "./default-auth-org";

export enum LoginMethod {
  EMAIL = "email",
  GOOGLE = "google",
  GITHUB = "github",
  GITLAB = "gitlab",
  SAML = "saml",
  LDAP = "ldap",
  OIDC = "oidc"
}

const LOGIN_METHODS: readonly string[] = Object.values(LoginMethod);

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

  // The org whose SSO the login page offers, if the instance names one.
  get defaultAuthOrgId(): string | null {
    return this.defaultAuthOrg.id;
  }

  // No list stored means every method is enabled.
  allows(method: LoginMethod): boolean {
    return !this.enabledLoginMethods || this.enabledLoginMethods.includes(method);
  }

  // Whether an LDAP login skips email verification because the instance admin trusts the directory's emails.
  trustsLdapEmails(): boolean {
    return Boolean(this.trustLdapEmails);
  }

  changeLoginMethods(methods: LoginMethod[]): LoginPolicy {
    if (methods.length === 0) {
      throw new RuleViolationError({ message: "At least one login method should be enabled." });
    }
    const unknown = methods.filter((method) => !LOGIN_METHODS.includes(method));
    if (unknown.length > 0) {
      throw new RuleViolationError({ message: `Unknown login method: ${unknown.join(", ")}` });
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
