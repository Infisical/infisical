import { OrganizationActionScope } from "@app/db/schemas";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { getConfig } from "@app/lib/config/env";
import { TOrgDALFactory } from "@app/services/org/org-dal";

import { TUserActivationDALFactory } from "./user-activation-dal";
import { TActivationRecord, TGetSecretsActivationStatusDTO, TSecretsActivationStatus } from "./user-activation-types";

type TUserActivationServiceFactoryDep = {
  userActivationDAL: TUserActivationDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  orgDAL: Pick<TOrgDALFactory, "findById" | "countAllOrgMembers">;
};

export type TUserActivationServiceFactory = ReturnType<typeof userActivationServiceFactory>;

export const userActivationServiceFactory = ({
  userActivationDAL,
  permissionService,
  orgDAL
}: TUserActivationServiceFactoryDep) => {
  const toActivation = (record: TActivationRecord) => ({
    firstSecretCreatedAt: record.firstSecretCreatedAt ?? null,
    returnedAfterThreeDaysAt: record.returnedAfterThreeDaysAt ?? null,
    returnedAfterSevenDaysAt: record.returnedAfterSevenDaysAt ?? null
  });

  // Decides whether the UI should surface the member-invite activation banner and, if so, which
  // message. Gated on the org being young, small, and the caller being able to invite members.
  const getSecretsActivationStatus = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod
  }: TGetSecretsActivationStatusDTO): Promise<TSecretsActivationStatus> => {
    const noActivation: TSecretsActivationStatus = { shouldShowActivation: false, stage: null, activation: null };
    const appCfg = getConfig();

    // 1. The caller must be able to invite other members to the org.
    const { permission } = await permissionService.getOrgPermission({
      actor,
      actorId,
      orgId: actorOrgId,
      actorOrgId,
      actorAuthMethod,
      scope: OrganizationActionScope.Any
    });
    if (!permission.can(OrgPermissionActions.Create, OrgPermissionSubjects.Member)) return noActivation;

    // 2. The org must be young enough (SECRETS_ACTIVATION_ORG_MAX_AGE_MONTHS) or has less than 5 u
    const org = await orgDAL.findById(actorOrgId);
    if (!org) return noActivation;

    const memberCount = await orgDAL.countAllOrgMembers(actorOrgId);

    const orgAgeCutoff = new Date();
    orgAgeCutoff.setMonth(orgAgeCutoff.getMonth() - appCfg.SECRETS_ACTIVATION_ORG_MAX_AGE_MONTHS);
    if (org.createdAt.getTime() < orgAgeCutoff.getTime() || memberCount >= appCfg.SECRETS_ACTIVATION_ORG_MAX_MEMBERS)
      return noActivation;

    // Read-modify-write under a row lock so concurrent activation checks for the same
    // (userId, orgId) can't double-stamp a stage or lose an update. FOR UPDATE can't lock a row
    // that doesn't exist yet, so the first-interaction insert still goes through ON CONFLICT
    // (upsert) to stay safe against a concurrent first request.
    return userActivationDAL.transaction(async (tx): Promise<TSecretsActivationStatus> => {
      const existingActivation = await userActivationDAL.findOneForUpdate({ userId: actorId, orgId: actorOrgId }, tx);
      const now = new Date();

      // First interaction: creating the row is itself the signal that this is the user's first
      // action, so we stamp firstSecretCreatedAt. This also covers orgs that predate the feature.
      if (!existingActivation) {
        const [createdActivation] = await userActivationDAL.upsert(
          [{ userId: actorId, orgId: actorOrgId, firstSecretCreatedAt: now }],
          ["userId", "orgId"],
          tx
        );
        return { shouldShowActivation: true, stage: "FIRST_SECRET", activation: toActivation(createdActivation) };
      }

      // Row exists but firstSecretCreatedAt was never set: treat this call as the first action.
      if (!existingActivation.firstSecretCreatedAt) {
        const updatedActivation = await userActivationDAL.updateById(
          existingActivation.id,
          { firstSecretCreatedAt: now },
          tx
        );
        return { shouldShowActivation: true, stage: "FIRST_SECRET", activation: toActivation(updatedActivation) };
      }

      const elapsedMs = now.getTime() - existingActivation.firstSecretCreatedAt.getTime();

      if (!existingActivation.returnedAfterThreeDaysAt && elapsedMs >= appCfg.SECRETS_ACTIVATION_FIRST_NUDGE_DELAY) {
        const updatedActivation = await userActivationDAL.updateById(
          existingActivation.id,
          { returnedAfterThreeDaysAt: now },
          tx
        );
        return { shouldShowActivation: true, stage: "THREE_DAYS", activation: toActivation(updatedActivation) };
      }

      if (!existingActivation.returnedAfterSevenDaysAt && elapsedMs >= appCfg.SECRETS_ACTIVATION_SECOND_NUDGE_DELAY) {
        const updatedActivation = await userActivationDAL.updateById(
          existingActivation.id,
          { returnedAfterSevenDaysAt: now },
          tx
        );
        return { shouldShowActivation: true, stage: "SEVEN_DAYS", activation: toActivation(updatedActivation) };
      }

      return { shouldShowActivation: false, stage: null, activation: toActivation(existingActivation) };
    });
  };

  return {
    getSecretsActivationStatus
  };
};
