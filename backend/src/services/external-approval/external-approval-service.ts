import { Knex } from "knex";

import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, DatabaseError, NotFoundError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { APP_CONNECTION_NAME_MAP } from "@app/services/app-connection/app-connection-maps";
import { TAppConnectionServiceFactory } from "@app/services/app-connection/app-connection-service";
import { TApprovalPolicyDALFactory } from "@app/services/approval-policy/approval-policy-dal";
import { TApprovalRequestDALFactory } from "@app/services/approval-policy/approval-request-dal";

import { ExternalApprovalPolicyType, ExternalApprovalRequestStatus } from "./external-approval-enums";
import { listExternalApprovalOptions } from "./external-approval-fns";
import { EXTERNAL_APPROVAL_CONNECTION_MAP, EXTERNAL_APPROVAL_NAME_MAP } from "./external-approval-maps";
import { TExternalApprovalPolicyDALFactory } from "./external-approval-policy-dal";
import { TExternalApprovalRequestDALFactory } from "./external-approval-request-dal";
import {
  TCreateExternalApprovalPolicyDTO,
  TCreateExternalApprovalRequestDTO,
  TExternalApprovalPolicy,
  TExternalApprovalRequest,
  TUpdateExternalApprovalPolicyDTO,
  TUpdateExternalApprovalRequestDTO,
  TValidateExternalApprovalConnectionDTO
} from "./external-approval-types";

type TExternalApprovalServiceFactoryDep = {
  externalApprovalPolicyDAL: TExternalApprovalPolicyDALFactory;
  externalApprovalRequestDAL: TExternalApprovalRequestDALFactory;
  approvalPolicyDAL: Pick<TApprovalPolicyDALFactory, "findById">;
  approvalRequestDAL: Pick<TApprovalRequestDALFactory, "findById">;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
  appConnectionService: Pick<TAppConnectionServiceFactory, "validateAppConnectionUsageById">;
};

export type TExternalApprovalServiceFactory = ReturnType<typeof externalApprovalServiceFactory>;

const isUniqueViolation = (err: unknown) =>
  err instanceof DatabaseError && (err.error as { code?: string })?.code === DatabaseErrorCode.UniqueViolation;

export const externalApprovalServiceFactory = ({
  externalApprovalPolicyDAL,
  externalApprovalRequestDAL,
  approvalPolicyDAL,
  approvalRequestDAL,
  appConnectionDAL,
  appConnectionService
}: TExternalApprovalServiceFactoryDep) => {
  const $assertConnectionMatches = async (
    {
      type,
      connectionId,
      organizationId
    }: { type: ExternalApprovalPolicyType; connectionId: string; organizationId: string },
    tx?: Knex
  ) => {
    const appConnection = await appConnectionDAL.findById(connectionId, tx);

    if (!appConnection || appConnection.orgId !== organizationId) {
      throw new NotFoundError({ message: `App Connection with ID '${connectionId}' not found` });
    }

    const expectedApp = EXTERNAL_APPROVAL_CONNECTION_MAP[type];
    const connectionApp = appConnection.app as AppConnection;

    if (connectionApp !== expectedApp) {
      throw new BadRequestError({
        message: `${APP_CONNECTION_NAME_MAP[connectionApp]} Connection with ID '${connectionId}' cannot be used as a ${EXTERNAL_APPROVAL_NAME_MAP[type]} external approver. Select a ${APP_CONNECTION_NAME_MAP[expectedApp]} Connection instead.`
      });
    }
  };

  const validateConnection = async (
    { type, connectionId, projectId }: TValidateExternalApprovalConnectionDTO,
    actor: OrgServiceActor
  ) => {
    return appConnectionService.validateAppConnectionUsageById(
      EXTERNAL_APPROVAL_CONNECTION_MAP[type],
      { connectionId, projectId },
      actor
    );
  };

  const createPolicy = async ({ policyId, type, connectionId }: TCreateExternalApprovalPolicyDTO, tx?: Knex) => {
    const approvalPolicy = await approvalPolicyDAL.findById(policyId, tx);
    if (!approvalPolicy) {
      throw new NotFoundError({ message: `Approval policy with ID '${policyId}' not found` });
    }

    await $assertConnectionMatches({ type, connectionId, organizationId: approvalPolicy.organizationId }, tx);

    try {
      const policy = await externalApprovalPolicyDAL.create({ policyId, type, connectionId }, tx);
      return policy as TExternalApprovalPolicy;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new BadRequestError({
          message: `Approval policy with ID '${policyId}' already has an external approver configured`
        });
      }
      throw err;
    }
  };

  const getPolicyByPolicyId = async (policyId: string, tx?: Knex) => {
    const policy = await externalApprovalPolicyDAL.findOne({ policyId }, tx);
    return (policy as TExternalApprovalPolicy | undefined) ?? null;
  };

  const updatePolicy = async ({ policyId, type, connectionId }: TUpdateExternalApprovalPolicyDTO, tx?: Knex) => {
    const existing = await externalApprovalPolicyDAL.findOne({ policyId }, tx);
    if (!existing) {
      throw new NotFoundError({ message: `Approval policy with ID '${policyId}' has no external approver configured` });
    }

    const newType = type ?? (existing.type as ExternalApprovalPolicyType);
    const newConnectionId = connectionId ?? existing.connectionId;

    if (newType === existing.type && newConnectionId === existing.connectionId) {
      return existing as TExternalApprovalPolicy;
    }

    const approvalPolicy = await approvalPolicyDAL.findById(policyId, tx);
    if (!approvalPolicy) {
      throw new NotFoundError({ message: `Approval policy with ID '${policyId}' not found` });
    }

    await $assertConnectionMatches(
      { type: newType, connectionId: newConnectionId, organizationId: approvalPolicy.organizationId },
      tx
    );

    const [policy] = await externalApprovalPolicyDAL.update(
      { policyId },
      { type: newType, connectionId: newConnectionId },
      tx
    );
    return policy as TExternalApprovalPolicy;
  };

  const deletePolicyByPolicyId = async (policyId: string, tx?: Knex) => {
    const [policy] = await externalApprovalPolicyDAL.delete({ policyId }, tx);
    return (policy as TExternalApprovalPolicy | undefined) ?? null;
  };

  const createRequest = async (
    {
      requestId,
      status = ExternalApprovalRequestStatus.PendingDispatch,
      statusReason
    }: TCreateExternalApprovalRequestDTO,
    tx?: Knex
  ) => {
    const approvalRequest = await approvalRequestDAL.findById(requestId, tx);
    if (!approvalRequest) {
      throw new NotFoundError({ message: `Approval request with ID '${requestId}' not found` });
    }

    try {
      const request = await externalApprovalRequestDAL.create({ requestId, status, statusReason }, tx);
      return request as TExternalApprovalRequest;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new BadRequestError({
          message: `Approval request with ID '${requestId}' already has an external approval request`
        });
      }
      throw err;
    }
  };

  const getRequestByRequestId = async (requestId: string, tx?: Knex) => {
    const request = await externalApprovalRequestDAL.findOne({ requestId }, tx);
    return (request as TExternalApprovalRequest | undefined) ?? null;
  };

  const updateRequest = async ({ requestId, status, statusReason }: TUpdateExternalApprovalRequestDTO, tx?: Knex) => {
    const patch = {
      ...(status !== undefined && { status }),
      ...(statusReason !== undefined && { statusReason })
    };

    if (Object.keys(patch).length === 0) {
      const existing = await externalApprovalRequestDAL.findOne({ requestId }, tx);
      if (!existing) {
        throw new NotFoundError({
          message: `Approval request with ID '${requestId}' has no external approval request`
        });
      }
      return existing as TExternalApprovalRequest;
    }

    const [request] = await externalApprovalRequestDAL.update({ requestId }, patch, tx);
    if (!request) {
      throw new NotFoundError({ message: `Approval request with ID '${requestId}' has no external approval request` });
    }
    return request as TExternalApprovalRequest;
  };

  const deleteRequestByRequestId = async (requestId: string, tx?: Knex) => {
    const [request] = await externalApprovalRequestDAL.delete({ requestId }, tx);
    return (request as TExternalApprovalRequest | undefined) ?? null;
  };

  return {
    listExternalApprovalOptions,
    validateConnection,
    createPolicy,
    getPolicyByPolicyId,
    updatePolicy,
    deletePolicyByPolicyId,
    createRequest,
    getRequestByRequestId,
    updateRequest,
    deleteRequestByRequestId
  };
};
