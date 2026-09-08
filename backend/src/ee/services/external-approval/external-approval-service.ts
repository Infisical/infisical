import { Knex } from "knex";

import { NotFoundError } from "@app/lib/errors";
import { TAppConnectionServiceFactory } from "@app/services/app-connection/app-connection-service";
import { TIdentityDALFactory } from "@app/services/identity/identity-dal";

import { ExternalApprovalRequestStatus } from "./external-approval-enums";
import { EXTERNAL_APPROVAL_APP_CONNECTION_MAP } from "./external-approval-map";
import { TExternalApprovalPolicyDALFactory } from "./external-approval-policy-dal";
import { TExternalApprovalRequestDALFactory } from "./external-approval-request-dal";
import {
  TExternalApprovalPolicyInput,
  TMarkExternalApprovalRequestApprovedDTO,
  TValidateExternalApprovalPolicyInputDTO
} from "./external-approval-types";

type TExternalApprovalServiceFactoryDep = {
  externalApprovalPolicyDAL: Pick<TExternalApprovalPolicyDALFactory, "create" | "updateById" | "deleteById">;
  externalApprovalRequestDAL: Pick<TExternalApprovalRequestDALFactory, "create" | "updateById">;
  appConnectionService: Pick<TAppConnectionServiceFactory, "validateAppConnectionUsageById">;
  identityDAL: Pick<TIdentityDALFactory, "findOne">;
};

export type TExternalApprovalServiceFactory = ReturnType<typeof externalApprovalServiceFactory>;

export const externalApprovalServiceFactory = ({
  externalApprovalPolicyDAL,
  externalApprovalRequestDAL,
  appConnectionService,
  identityDAL
}: TExternalApprovalServiceFactoryDep) => {
  const validateExternalApprovalPolicyInput = async ({
    input,
    projectId,
    actor
  }: TValidateExternalApprovalPolicyInputDTO) => {
    const app = EXTERNAL_APPROVAL_APP_CONNECTION_MAP[input.type];
    await appConnectionService.validateAppConnectionUsageById(
      app,
      { connectionId: input.connectionId, projectId },
      actor
    );

    if (input.approverIdentityId) {
      const identity = await identityDAL.findOne({ id: input.approverIdentityId, orgId: actor.orgId });
      if (!identity) {
        throw new NotFoundError({
          message: `Identity with ID '${input.approverIdentityId}' not found in your organization`
        });
      }
    }
  };

  // todo: refactor the call for these on the other services and remove it from the service

  const createExternalApprovalPolicy = async (input: TExternalApprovalPolicyInput, tx?: Knex) => {
    return externalApprovalPolicyDAL.create(
      {
        type: input.type,
        connectionId: input.connectionId,
        approverIdentityId: input.approverIdentityId ?? null
      },
      tx
    );
  };

  const updateExternalApprovalPolicy = async (id: string, input: TExternalApprovalPolicyInput, tx?: Knex) => {
    return externalApprovalPolicyDAL.updateById(
      id,
      {
        type: input.type,
        connectionId: input.connectionId,
        approverIdentityId: input.approverIdentityId ?? null
      },
      tx
    );
  };

  const deleteExternalApprovalPolicy = async (id: string, tx?: Knex) => {
    return externalApprovalPolicyDAL.deleteById(id, tx);
  };

  const createPendingExternalApprovalRequest = async (tx?: Knex) => {
    return externalApprovalRequestDAL.create({ status: ExternalApprovalRequestStatus.PendingDispatch }, tx);
  };

  const markExternalApprovalRequestApproved = async (
    { externalApprovalRequestId, approvedByIdentityId }: TMarkExternalApprovalRequestApprovedDTO,
    tx?: Knex
  ) => {
    return externalApprovalRequestDAL.updateById(
      externalApprovalRequestId,
      {
        status: ExternalApprovalRequestStatus.Approved,
        approvedAt: new Date(),
        approvedByIdentityId: approvedByIdentityId ?? null
      },
      tx
    );
  };

  return {
    validateExternalApprovalPolicyInput,
    createExternalApprovalPolicy,
    updateExternalApprovalPolicy,
    deleteExternalApprovalPolicy,
    createPendingExternalApprovalRequest,
    markExternalApprovalRequestApproved
  };
};
