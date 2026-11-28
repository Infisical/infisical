import { InstanceConfig, TInstanceConfigRecord } from "../models/instance-config";
import { TInstanceConfigStore } from "../services/dependencies";

type TOrg = { id: string; slug: string; authEnforced: boolean; authMethod: "saml" | "oidc" | null };

export class InMemoryInstanceConfigStore implements TInstanceConfigStore {
  private row: TInstanceConfigRecord | null = null;

  private orgs = new Map<string, TOrg>();

  addOrg(org: TOrg) {
    this.orgs.set(org.id, org);
  }

  seed(config: InstanceConfig) {
    this.row = config.toJSON();
  }

  async find() {
    return this.read();
  }

  async findForUpdate() {
    return this.read();
  }

  async createIfMissing(config: InstanceConfig) {
    if (this.row) return;
    const record = config.toJSON();
    this.row = {
      id: record.id,
      instanceId: record.instanceId,
      initialized: record.initialized,
      allowSignUp: record.allowSignUp,
      trustLdapEmails: false,
      defaultAuthOrgId: record.defaultAuthOrgId,
      fipsEnabled: record.fipsEnabled,
      onboardingCompleted: record.onboardingCompleted,
      createdAt: record.createdAt,
      updatedAt: new Date()
    };
  }

  async save(config: InstanceConfig) {
    if (!this.row) return;
    const record = config.toJSON();
    this.row = {
      ...record,
      defaultAuthOrgSlug: undefined,
      defaultAuthOrgAuthEnforced: undefined,
      defaultAuthOrgAuthMethod: undefined,
      instanceId: this.row.instanceId,
      fipsEnabled: this.row.fipsEnabled,
      createdAt: this.row.createdAt,
      updatedAt: new Date()
    };
  }

  snapshot(): unknown {
    return { row: this.row, orgs: new Map(this.orgs) };
  }

  restore(snapshot: unknown) {
    const { row, orgs } = snapshot as { row: TInstanceConfigRecord | null; orgs: Map<string, TOrg> };
    this.row = row;
    this.orgs = new Map(orgs);
  }

  private read() {
    if (!this.row) return null;
    const org = this.row.defaultAuthOrgId ? this.orgs.get(this.row.defaultAuthOrgId) : undefined;
    return InstanceConfig.restore({
      ...this.row,
      defaultAuthOrgSlug: org?.slug ?? null,
      defaultAuthOrgAuthEnforced: org?.authEnforced ?? null,
      defaultAuthOrgAuthMethod: org?.authMethod ?? null
    });
  }
}
