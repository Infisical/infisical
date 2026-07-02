import { OrganizationActionScope } from "@app/db/schemas";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { TOrgDALFactory } from "@app/services/org/org-dal";

import { TUserActivationDALFactory } from "./user-activation-dal";
import { TGetSecretsActivationStatusDTO } from "./user-activation-types";

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const ORG_MAX_AGE_MONTHS = 2;
const ORG_MAX_MEMBERS = 5;
const RETURNED_AFTER_THREE_DAYS_MS = 3 * DAY_IN_MS;
const RETURNED_AFTER_SEVEN_DAYS_MS = 7 * DAY_IN_MS;

type TUserActivationServiceFactoryDep = {
  userActivationDAL: TUserActivationDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  orgDAL: Pick<TOrgDALFactory, "findById" | "countAllOrgMembers">;
};

export type TUserActivationServiceFactory = ReturnType<typeof userActivationServiceFactory>;

type TActivationRecord = {
  firstSecretCreatedAt?: Date | null;
  returnedAfterThreeDaysAt?: Date | null;
  returnedAfterSevenDaysAt?: Date | null;
};

type TSecretsActivationStatus = {
  shouldShowActivation: boolean;
  stage: "FIRST_SECRET" | "THREE_DAYS" | "SEVEN_DAYS" | null;
  activation: {
    firstSecretCreatedAt: Date | null;
    returnedAfterThreeDaysAt: Date | null;
    returnedAfterSevenDaysAt: Date | null;
  } | null;
};

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

    // 2. The org must be younger than 2 months.
    const org = await orgDAL.findById(actorOrgId);
    if (!org) return noActivation;
    const orgAgeCutoff = new Date();
    orgAgeCutoff.setMonth(orgAgeCutoff.getMonth() - ORG_MAX_AGE_MONTHS);
    if (org.createdAt.getTime() < orgAgeCutoff.getTime()) return noActivation;

    // 3. The org must have fewer than 5 users.
    const memberCount = await orgDAL.countAllOrgMembers(actorOrgId);
    if (memberCount >= ORG_MAX_MEMBERS) return noActivation;

    const existingActivation = await userActivationDAL.findOne({ userId: actorId, orgId: actorOrgId });
    const now = new Date();

    // First interaction: creating the row is itself the signal that this is the user's first action,
    // so we stamp firstSecretCreatedAt. This also covers orgs that predate the feature.
    if (!existingActivation) {
      const createdActivation = await userActivationDAL.create({
        userId: actorId,
        orgId: actorOrgId,
        firstSecretCreatedAt: now
      });
      return { shouldShowActivation: true, stage: "FIRST_SECRET", activation: toActivation(createdActivation) };
    }

    // if the row was created and the firstSecretCreatedAt is not set, it means the user has not created a secret yet
    if (!existingActivation.firstSecretCreatedAt) {
      existingActivation.firstSecretCreatedAt = now;
      await userActivationDAL.updateById(existingActivation.id, existingActivation);

      return { shouldShowActivation: true, stage: "FIRST_SECRET", activation: toActivation(existingActivation) };
    }

    const elapsedMs = now.getTime() - existingActivation.firstSecretCreatedAt.getTime();

    if (!existingActivation.returnedAfterThreeDaysAt && elapsedMs >= RETURNED_AFTER_THREE_DAYS_MS) {
      const updatedActivation = await userActivationDAL.updateById(existingActivation.id, {
        returnedAfterThreeDaysAt: now
      });
      return { shouldShowActivation: true, stage: "THREE_DAYS", activation: toActivation(updatedActivation) };
    }

    if (!existingActivation.returnedAfterSevenDaysAt && elapsedMs >= RETURNED_AFTER_SEVEN_DAYS_MS) {
      const updatedActivation = await userActivationDAL.updateById(existingActivation.id, {
        returnedAfterSevenDaysAt: now
      });
      return { shouldShowActivation: true, stage: "SEVEN_DAYS", activation: toActivation(updatedActivation) };
    }

    return { shouldShowActivation: false, stage: null, activation: toActivation(existingActivation) };
  };

  return {
    getSecretsActivationStatus
  };
};
