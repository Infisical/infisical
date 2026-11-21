// Field names match the super_admin columns, so restore() takes the row as it is.
export type TSignUpPolicyRecord = {
  allowSignUp?: boolean | null;
  allowedSignUpDomain?: string | null;
};

// Who may create an account on the instance.
export class SignUpPolicy {
  private constructor(
    private readonly allowSignUp: boolean | null,
    private readonly allowedSignUpDomain: string | null
  ) {}

  static restore(record: TSignUpPolicyRecord): SignUpPolicy {
    return new SignUpPolicy(record.allowSignUp ?? null, record.allowedSignUpDomain ?? null);
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
