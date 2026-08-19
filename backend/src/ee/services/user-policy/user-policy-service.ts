import { ForbiddenError } from "@casl/ability";

import { ActionProjectType } from "@app/db/schemas";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, DatabaseError, NotFoundError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";

import { AGENT_POLICY_TARGETS } from "../agent-policy/agent-policy-templates";
import { assertNoDuplicateRules } from "../agent-policy/policy-rule-fns";
import { TLicenseServiceFactory } from "../license/license-service";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { ProjectPermissionActions, ProjectPermissionSub } from "../permission/project-permission";
import { TUserPolicyDALFactory, TUserPolicyRuleDALFactory, TUserPolicyUserDALFactory } from "./user-policy-dal";

export type TUserPolicyServiceFactory = ReturnType<typeof userPolicyServiceFactory>;

type TRuleInput = { hostPattern: string; methods: string[] };

type TUserPolicyServiceFactoryDep = {
  userPolicyDAL: TUserPolicyDALFactory;
  userPolicyUserDAL: TUserPolicyUserDALFactory;
  userPolicyRuleDAL: TUserPolicyRuleDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

export const userPolicyServiceFactory = ({
  userPolicyDAL,
  userPolicyUserDAL,
  userPolicyRuleDAL,
  permissionService,
  licenseService
}: TUserPolicyServiceFactoryDep) => {
  const $checkLicense = async (orgId: string) => {
    const plan = await licenseService.getPlan(orgId);
    if (!plan.secretsBrokering) {
      throw new BadRequestError({
        message: "Failed to use secrets brokering due to plan restriction. Upgrade your plan to use user policies."
      });
    }
  };

  const $assertPermission = async (actor: OrgServiceActor, projectId: string, action: ProjectPermissionActions) => {
    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager,
      projectId
    });
    ForbiddenError.from(permission).throwUnlessCan(action, ProjectPermissionSub.UserPolicies);
  };

  // A policy naming someone with no access to the project would never take effect, since the runtime
  // intersection is scoped to a project. Catching it here beats a policy that silently does nothing.
  const $assertUsersInProject = async (projectId: string, userIds: string[]) => {
    if (!userIds.length) {
      throw new BadRequestError({ message: "Select at least one user for this policy" });
    }

    const unique = [...new Set(userIds)];
    const members = new Set(await userPolicyDAL.findProjectMemberUserIds(projectId, unique));

    const notMembers = unique.filter((userId) => !members.has(userId));
    if (notMembers.length) {
      throw new BadRequestError({
        message: `User is not a member of this project: ${notMembers.join(", ")}`
      });
    }

    return unique;
  };

  const $assertRulesUsable = (rules: TRuleInput[]) => {
    const duplicates = assertNoDuplicateRules(rules);
    if (duplicates.length) {
      throw new BadRequestError({
        message: `Remove the duplicate rule(s) for: ${[...new Set(duplicates)].join(", ")}`
      });
    }
  };

  const $hydrate = async (policies: Awaited<ReturnType<typeof userPolicyDAL.find>>) => {
    const policyIds = policies.map((policy) => policy.id);
    const [users, rules] = await Promise.all([
      userPolicyUserDAL.findByPolicyIds(policyIds),
      userPolicyRuleDAL.findByPolicyIds(policyIds)
    ]);

    return policies.map((policy) => ({
      ...policy,
      users: users
        .filter((user) => user.policyId === policy.id)
        .map((user) => ({
          userId: user.userId,
          username: user.username,
          email: (user.email as string | null) ?? null,
          firstName: (user.firstName as string | null) ?? null,
          lastName: (user.lastName as string | null) ?? null
        })),
      rules: rules
        .filter((rule) => rule.policyId === policy.id)
        .map((rule) => ({ id: rule.id, hostPattern: rule.hostPattern, methods: rule.methods }))
    }));
  };

  const getById = async ({ policyId }: { policyId: string }, actor: OrgServiceActor) => {
    await $checkLicense(actor.orgId);

    const policy = await userPolicyDAL.findById(policyId);
    if (!policy) {
      throw new NotFoundError({ message: `User policy with ID "${policyId}" not found` });
    }
    await $assertPermission(actor, policy.projectId, ProjectPermissionActions.Read);

    const [hydrated] = await $hydrate([policy]);
    return hydrated;
  };

  const create = async (
    {
      projectId,
      name,
      target,
      userIds,
      rules
    }: { projectId: string; name: string; target: string; userIds: string[]; rules: TRuleInput[] },
    actor: OrgServiceActor
  ) => {
    await $checkLicense(actor.orgId);
    await $assertPermission(actor, projectId, ProjectPermissionActions.Create);

    if (!AGENT_POLICY_TARGETS.includes(target)) {
      throw new BadRequestError({ message: `Unknown target "${target}"` });
    }

    const users = await $assertUsersInProject(projectId, userIds);
    $assertRulesUsable(rules);

    try {
      const policy = await userPolicyDAL.transaction(async (tx) => {
        const created = await userPolicyDAL.create({ projectId, name, target }, tx);
        await userPolicyUserDAL.insertMany(
          users.map((userId) => ({ policyId: created.id, userId })),
          tx
        );
        await userPolicyRuleDAL.insertMany(
          rules.map((rule) => ({ policyId: created.id, hostPattern: rule.hostPattern, methods: rule.methods })),
          tx
        );
        return created;
      });

      return await getById({ policyId: policy.id }, actor);
    } catch (err) {
      if (err instanceof DatabaseError && (err.error as { code: string })?.code === DatabaseErrorCode.UniqueViolation) {
        throw new BadRequestError({ message: `A user policy named "${name}" already exists in this project` });
      }
      throw err;
    }
  };

  const list = async ({ projectId }: { projectId: string }, actor: OrgServiceActor) => {
    await $checkLicense(actor.orgId);
    await $assertPermission(actor, projectId, ProjectPermissionActions.Read);

    const policies = await userPolicyDAL.find({ projectId }, { sort: [["name", "asc"]] });
    return $hydrate(policies);
  };

  const updateById = async (
    { policyId, name, userIds, rules }: { policyId: string; name?: string; userIds?: string[]; rules?: TRuleInput[] },
    actor: OrgServiceActor
  ) => {
    await $checkLicense(actor.orgId);

    const policy = await userPolicyDAL.findById(policyId);
    if (!policy) {
      throw new NotFoundError({ message: `User policy with ID "${policyId}" not found` });
    }
    await $assertPermission(actor, policy.projectId, ProjectPermissionActions.Edit);

    const users = userIds ? await $assertUsersInProject(policy.projectId, userIds) : undefined;
    if (rules) $assertRulesUsable(rules);

    try {
      await userPolicyDAL.transaction(async (tx) => {
        if (name !== undefined) {
          await userPolicyDAL.updateById(policyId, { name }, tx);
        }
        if (users) {
          await userPolicyUserDAL.delete({ policyId }, tx);
          await userPolicyUserDAL.insertMany(
            users.map((userId) => ({ policyId, userId })),
            tx
          );
        }
        if (rules) {
          await userPolicyRuleDAL.delete({ policyId }, tx);
          await userPolicyRuleDAL.insertMany(
            rules.map((rule) => ({ policyId, hostPattern: rule.hostPattern, methods: rule.methods })),
            tx
          );
        }
      });
    } catch (err) {
      if (err instanceof DatabaseError && (err.error as { code: string })?.code === DatabaseErrorCode.UniqueViolation) {
        throw new BadRequestError({ message: `A user policy named "${name}" already exists in this project` });
      }
      throw err;
    }

    return getById({ policyId }, actor);
  };

  const deleteById = async ({ policyId }: { policyId: string }, actor: OrgServiceActor) => {
    await $checkLicense(actor.orgId);

    const policy = await userPolicyDAL.findById(policyId);
    if (!policy) {
      throw new NotFoundError({ message: `User policy with ID "${policyId}" not found` });
    }
    await $assertPermission(actor, policy.projectId, ProjectPermissionActions.Delete);

    await userPolicyDAL.deleteById(policyId);
    return policy;
  };

  return {
    create,
    list,
    getById,
    updateById,
    deleteById
  };
};
