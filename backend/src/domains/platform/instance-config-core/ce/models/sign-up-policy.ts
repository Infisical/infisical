import { matchesAllowedEmailDomain } from "@app/lib/validator";

// Field names match the super_admin columns, so restore() takes the row as it is.
export type TSignUpPolicyRecord = {
  allowSignUp?: boolean | null;
  allowedSignUpDomain?: string | null;
};

export enum SignUpRefusal {
  Closed = "closed",
  DomainNotAllowed = "domain-not-allowed"
}

// Who may create an account on the instance.
export class SignUpPolicy {
  private constructor(
    private readonly allowSignUp: boolean | null,
    private readonly allowedSignUpDomain: string | null
  ) {}

  static restore(record: TSignUpPolicyRecord): SignUpPolicy {
    return new SignUpPolicy(record.allowSignUp ?? null, record.allowedSignUpDomain ?? null);
  }

  // Why this email may not create an account, or null when it may. Callers word the refusal for their own flow.
  refusalFor(email: string): SignUpRefusal | null {
    if (!this.allowSignUp) return SignUpRefusal.Closed;
    if (this.allowedSignUpDomain && !matchesAllowedEmailDomain(email, this.allowedSignUpDomain)) {
      return SignUpRefusal.DomainNotAllowed;
    }
    return null;
  }

  isOpen(): boolean {
    return Boolean(this.allowSignUp);
  }

  // Values left undefined stay as they are.
  change(policy: { allowSignUp?: boolean; allowedSignUpDomain?: string | null }): SignUpPolicy {
    return new SignUpPolicy(
      policy.allowSignUp !== undefined ? policy.allowSignUp : this.allowSignUp,
      policy.allowedSignUpDomain !== undefined ? policy.allowedSignUpDomain : this.allowedSignUpDomain
    );
  }

  // Self-hosted instances close sign-up once the first admin has set them up.
  close(): SignUpPolicy {
    return new SignUpPolicy(false, this.allowedSignUpDomain);
  }

  toJSON(): Required<TSignUpPolicyRecord> {
    return { allowSignUp: this.allowSignUp, allowedSignUpDomain: this.allowedSignUpDomain };
  }
}
