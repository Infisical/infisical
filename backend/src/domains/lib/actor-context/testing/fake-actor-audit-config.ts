import type {
  TActorAuditConfig,
  TAuditEventClassSwitches,
  TAuditOrigin,
  TOrgAuditConfig,
  TProjectAuditConfig
} from "../actor-context";

// An audit configuration a test sets directly. Defaults: a 30-day plan, no projects, the default switches.
export class FakeActorAuditConfig implements TActorAuditConfig {
  orgConfig: TOrgAuditConfig = { retentionDays: 30 };

  projects = new Map<string, TProjectAuditConfig>();

  switches: TAuditEventClassSwitches = { authentication: true, authorization: false };

  projectSwitches = new Map<string, TAuditEventClassSwitches>();

  originFacts: TAuditOrigin = {};

  async org() {
    return this.orgConfig;
  }

  async project(projectId: string) {
    return this.projects.get(projectId) ?? null;
  }

  async eventClasses(projectId?: string) {
    return (projectId && this.projectSwitches.get(projectId)) || this.switches;
  }

  origin() {
    return this.originFacts;
  }
}
