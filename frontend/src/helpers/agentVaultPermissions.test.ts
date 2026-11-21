import { createMongoAbility, MongoAbility, RawRuleOf } from "@casl/ability";
import { describe, expect, it } from "vitest";

import {
  ProjectPermissionAgentVaultAccessBundleActions,
  ProjectPermissionAgentVaultServiceActions,
  ProjectPermissionAgentVaultSkillActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext";
import { conditionsMatcher } from "@app/hooks/api/roles/permission-matcher";

import {
  canUseAgentVaultAccessBundle,
  canUseAgentVaultAccessBundles,
  canUseAgentVaultService,
  canUseAgentVaultSkill,
  canUseAgentVaultSkills,
  canUseNewAgentVaultSkill
} from "./agentVaultPermissions";

const BUNDLE = "4c3b6f0e-8f5c-4a0b-9a51-0d2b1c7e5f21";
const OTHER_BUNDLE = "9686cd1a-659d-48ad-b53c-ec27a39b0830";
const SERVICE = "e83db5d4-ca14-4e6b-bcbe-d38e61f7c796";
const OTHER_SERVICE = "8facda6c-9da5-41c6-a92f-21329dcd09ca";
const SKILL = "1f5a3bd4-04b0-4759-9bf9-006e9649c66d";

type TRule = RawRuleOf<MongoAbility<ProjectPermissionSet>>;

const abilityOf = (rules: TRule[]) =>
  createMongoAbility<ProjectPermissionSet>(rules, { conditionsMatcher });

const useBundle = (accessBundleId: string): TRule => ({
  action: ProjectPermissionAgentVaultAccessBundleActions.Use,
  subject: ProjectPermissionSub.AgentVaultAccessBundles,
  conditions: { accessBundleId: { $in: [accessBundleId] } }
});

const readEverything: TRule[] = [
  {
    action: ProjectPermissionAgentVaultAccessBundleActions.Read,
    subject: ProjectPermissionSub.AgentVaultAccessBundles
  },
  {
    action: ProjectPermissionAgentVaultServiceActions.Read,
    subject: ProjectPermissionSub.AgentVaultServices
  },
  {
    action: ProjectPermissionAgentVaultSkillActions.Read,
    subject: ProjectPermissionSub.AgentVaultSkills
  }
];

describe("what a session can carry", () => {
  it("leaves out what a role can only read", () => {
    const permission = abilityOf(readEverything);
    expect(canUseAgentVaultAccessBundle(permission, BUNDLE)).toBe(false);
    expect(
      canUseAgentVaultService(permission, { id: SERVICE, accessBundles: [{ id: BUNDLE }] })
    ).toBe(false);
    expect(canUseAgentVaultSkill(permission, { id: SKILL, accessBundles: [{ id: BUNDLE }] })).toBe(
      false
    );
    expect(canUseAgentVaultAccessBundles(permission)).toBe(false);
    expect(canUseAgentVaultSkills(permission)).toBe(false);
  });

  it("takes a service or skill a bundle the role uses holds", () => {
    const permission = abilityOf([...readEverything, useBundle(BUNDLE)]);
    expect(canUseAgentVaultAccessBundle(permission, BUNDLE)).toBe(true);
    expect(canUseAgentVaultAccessBundle(permission, OTHER_BUNDLE)).toBe(false);
    expect(
      canUseAgentVaultService(permission, { id: SERVICE, accessBundles: [{ id: BUNDLE }] })
    ).toBe(true);
    expect(
      canUseAgentVaultService(permission, { id: SERVICE, accessBundles: [{ id: OTHER_BUNDLE }] })
    ).toBe(false);
    expect(canUseAgentVaultSkill(permission, { id: SKILL, accessBundles: [{ id: BUNDLE }] })).toBe(
      true
    );
    expect(canUseAgentVaultSkills(permission)).toBe(true);
  });

  it("takes a service or skill the role uses by ID, in no bundle", () => {
    const permission = abilityOf([
      {
        action: ProjectPermissionAgentVaultServiceActions.Use,
        subject: ProjectPermissionSub.AgentVaultServices,
        conditions: { serviceId: { $in: [SERVICE] } }
      },
      {
        action: ProjectPermissionAgentVaultSkillActions.Use,
        subject: ProjectPermissionSub.AgentVaultSkills,
        conditions: { skillId: { $eq: SKILL } }
      }
    ]);
    expect(canUseAgentVaultService(permission, { id: SERVICE, accessBundles: [] })).toBe(true);
    expect(canUseAgentVaultSkill(permission, { id: SKILL, accessBundles: [] })).toBe(true);
    expect(canUseAgentVaultSkill(permission, { id: SERVICE, accessBundles: [] })).toBe(false);
    expect(canUseAgentVaultAccessBundles(permission)).toBe(false);
    expect(canUseAgentVaultSkills(permission)).toBe(true);
  });

  it("refuses a bundle a role denies, even beside an allow for every bundle", () => {
    const permission = abilityOf([
      {
        action: ProjectPermissionAgentVaultAccessBundleActions.Use,
        subject: ProjectPermissionSub.AgentVaultAccessBundles
      },
      {
        action: ProjectPermissionAgentVaultAccessBundleActions.Use,
        subject: ProjectPermissionSub.AgentVaultAccessBundles,
        conditions: { accessBundleId: { $in: [OTHER_BUNDLE] } },
        inverted: true
      }
    ]);
    expect(canUseAgentVaultAccessBundle(permission, BUNDLE)).toBe(true);
    expect(canUseAgentVaultAccessBundle(permission, OTHER_BUNDLE)).toBe(false);
    expect(
      canUseAgentVaultService(permission, { id: SERVICE, accessBundles: [{ id: OTHER_BUNDLE }] })
    ).toBe(false);
  });

  it("keeps out a service or skill a role denies, even inside a bundle the role uses", () => {
    const permission = abilityOf([
      useBundle(BUNDLE),
      {
        action: ProjectPermissionAgentVaultServiceActions.Use,
        subject: ProjectPermissionSub.AgentVaultServices,
        conditions: { serviceId: { $in: [SERVICE] } },
        inverted: true
      },
      {
        action: ProjectPermissionAgentVaultSkillActions.Use,
        subject: ProjectPermissionSub.AgentVaultSkills,
        inverted: true
      }
    ]);
    expect(
      canUseAgentVaultService(permission, { id: SERVICE, accessBundles: [{ id: BUNDLE }] })
    ).toBe(false);
    expect(
      canUseAgentVaultService(permission, { id: OTHER_SERVICE, accessBundles: [{ id: BUNDLE }] })
    ).toBe(true);
    expect(canUseAgentVaultSkill(permission, { id: SKILL, accessBundles: [{ id: BUNDLE }] })).toBe(
      false
    );
  });
});

describe("canUseNewAgentVaultSkill", () => {
  const useSkills = (conditions?: Record<string, unknown>, inverted = false): TRule => ({
    action: ProjectPermissionAgentVaultSkillActions.Use,
    subject: ProjectPermissionSub.AgentVaultSkills,
    ...(conditions ? { conditions } : {}),
    ...(inverted ? { inverted } : {})
  });

  it("is true only when the caller's roles let them use every new skill", () => {
    expect(canUseNewAgentVaultSkill(abilityOf([useSkills()]))).toBe(true);
    expect(
      canUseNewAgentVaultSkill(
        abilityOf([useSkills(), useSkills({ skillId: { $in: [SKILL] } }, true)])
      )
    ).toBe(true);
    expect(canUseNewAgentVaultSkill(abilityOf([useSkills({ skillId: { $in: [SKILL] } })]))).toBe(
      false
    );
    expect(canUseNewAgentVaultSkill(abilityOf([useSkills(), useSkills(undefined, true)]))).toBe(
      false
    );
  });
});
