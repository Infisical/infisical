import { RuleViolationError, StateConflictError } from "@app/domains/lib/errors";

// Field names match the super_admin columns, so restore() takes the row as it is.
export type TInstanceSetupRecord = {
  initialized?: boolean | null;
  onboardingCompleted: boolean;
  adminIdentityIds?: string[] | null;
};

// Whether the first admin set the instance up and finished the admin onboarding (/admin/setup), and which machine
// identities hold instance admin access.
export class InstanceSetup {
  private constructor(
    private readonly initialized: boolean | null,
    private readonly onboardingCompleted: boolean,
    private readonly adminIdentityIds: readonly string[] | null
  ) {}

  static restore(record: TInstanceSetupRecord): InstanceSetup {
    return new InstanceSetup(record.initialized ?? null, record.onboardingCompleted, record.adminIdentityIds ?? null);
  }

  isAdminIdentity(identityId: string): boolean {
    return (this.adminIdentityIds ?? []).includes(identityId);
  }

  assertNotSetUp(): void {
    if (this.initialized) throw new StateConflictError({ message: "Instance has already been set up" });
  }

  complete(): InstanceSetup {
    this.assertNotSetUp();
    return new InstanceSetup(true, this.onboardingCompleted, this.adminIdentityIds);
  }

  changeOnboardingStatus(completed: boolean): InstanceSetup {
    return new InstanceSetup(this.initialized, completed, this.adminIdentityIds);
  }

  grantAdminIdentity(identityId: string): InstanceSetup {
    if (this.isAdminIdentity(identityId)) return this;
    return new InstanceSetup(this.initialized, this.onboardingCompleted, [
      ...(this.adminIdentityIds ?? []),
      identityId
    ]);
  }

  revokeAdminIdentity(identityId: string): InstanceSetup {
    if (!this.isAdminIdentity(identityId)) {
      throw new RuleViolationError({ name: "Identity", message: "Identity does not have super admin access" });
    }
    return new InstanceSetup(
      this.initialized,
      this.onboardingCompleted,
      (this.adminIdentityIds ?? []).filter((id) => id !== identityId)
    );
  }

  toJSON(): Required<TInstanceSetupRecord> {
    return {
      initialized: this.initialized,
      onboardingCompleted: this.onboardingCompleted,
      adminIdentityIds: this.adminIdentityIds ? [...this.adminIdentityIds] : null
    };
  }
}
