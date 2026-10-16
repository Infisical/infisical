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

import { DelegatedApprovalPolicyType, DelegatedApprovalRequestStatus } from "./delegated-approval-enums";
import { assertPolicyTypeSupportsDelegatedApproval, listDelegatedApprovalOptions } from "./delegated-approval-fns";
import { DELEGATED_APPROVAL_CONNECTION_MAP, DELEGATED_APPROVAL_NAME_MAP } from "./delegated-approval-maps";
import { TDelegatedApprovalPolicyDALFactory } from "./delegated-approval-policy-dal";
import { TDelegatedApprovalRequestDALFactory } from "./delegated-approval-request-dal";
import {
  TCreateDelegatedApprovalPolicyDTO,
  TCreateDelegatedApprovalRequestDTO,
  TDelegatedApprovalPolicy,
  TDelegatedApprovalRequest,
  TUpdateDelegatedApprovalPolicyDTO,
  TUpdateDelegatedApprovalRequestDTO,
  TValidateDelegatedApprovalConnectionDTO
} from "./delegated-approval-types";

type TDelegatedApprovalServiceFactoryDep = {
  delegatedApprovalPolicyDAL: TDelegatedApprovalPolicyDALFactory;
  delegatedApprovalRequestDAL: TDelegatedApprovalRequestDALFactory;
  approvalPolicyDAL: Pick<TApprovalPolicyDALFactory, "findById">;
  approvalRequestDAL: Pick<TApprovalRequestDALFactory, "findById">;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
  appConnectionService: Pick<TAppConnectionServiceFactory, "validateAppConnectionUsageById">;
};

export type TDelegatedApprovalServiceFactory = ReturnType<typeof delegatedApprovalServiceFactory>;

const isUniqueViolation = (err: unknown) =>
  err instanceof DatabaseError && (err.error as { code?: string })?.code === DatabaseErrorCode.UniqueViolation;

export const delegatedApprovalServiceFactory = ({
  delegatedApprovalPolicyDAL,
  delegatedApprovalRequestDAL,
  approvalPolicyDAL,
  approvalRequestDAL,
  appConnectionDAL,
  appConnectionService
}: TDelegatedApprovalServiceFactoryDep) => {
  const $assertConnectionMatches = async (
    {
      type,
      connectionId,
      organizationId
    }: { type: DelegatedApprovalPolicyType; connectionId: string; organizationId: string },
    tx?: Knex
  ) => {
    const appConnection = await appConnectionDAL.findById(connectionId, tx);

    if (!appConnection || appConnection.orgId !== organizationId) {
      throw new NotFoundError({ message: `App Connection with ID '${connectionId}' not found` });
    }

    const expectedApp = DELEGATED_APPROVAL_CONNECTION_MAP[type];
    const connectionApp = appConnection.app as AppConnection;

    if (connectionApp !== expectedApp) {
      throw new BadRequestError({
        message: `${APP_CONNECTION_NAME_MAP[connectionApp]} Connection with ID '${connectionId}' cannot be used as a ${DELEGATED_APPROVAL_NAME_MAP[type]} delegated approver. Select a ${APP_CONNECTION_NAME_MAP[expectedApp]} Connection instead.`
      });
    }
  };

  const validateConnection = async (
    { type, connectionId, projectId }: TValidateDelegatedApprovalConnectionDTO,
    actor: OrgServiceActor
  ) => {
    return appConnectionService.validateAppConnectionUsageById(
      DELEGATED_APPROVAL_CONNECTION_MAP[type],
      { connectionId, projectId },
      actor
    );
  };

  const createPolicy = async ({ policyId, type, connectionId }: TCreateDelegatedApprovalPolicyDTO, tx?: Knex) => {
    const approvalPolicy = await approvalPolicyDAL.findById(policyId, tx);
    if (!approvalPolicy) {
      throw new NotFoundError({ message: `Approval policy with ID '${policyId}' not found` });
    }
    assertPolicyTypeSupportsDelegatedApproval(approvalPolicy.type);

    await $assertConnectionMatches({ type, connectionId, organizationId: approvalPolicy.organizationId }, tx);

    try {
      const policy = await delegatedApprovalPolicyDAL.create({ policyId, type, connectionId }, tx);
      return policy as TDelegatedApprovalPolicy;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new BadRequestError({
          message: `Approval policy with ID '${policyId}' already has a delegated approver configured`
        });
      }
      throw err;
    }
  };

  const getPolicyByPolicyId = async (policyId: string, tx?: Knex) => {
    const policy = await delegatedApprovalPolicyDAL.findOne({ policyId }, tx);
    return (policy as TDelegatedApprovalPolicy | undefined) ?? null;
  };

  const updatePolicy = async ({ policyId, type, connectionId }: TUpdateDelegatedApprovalPolicyDTO, tx?: Knex) => {
    const existing = await delegatedApprovalPolicyDAL.findOne({ policyId }, tx);
    if (!existing) {
      throw new NotFoundError({
        message: `Approval policy with ID '${policyId}' has no delegated approver configured`
      });
    }

    const newType = type ?? (existing.type as DelegatedApprovalPolicyType);
    const newConnectionId = connectionId ?? existing.connectionId;

    if (newType === existing.type && newConnectionId === existing.connectionId) {
      return existing as TDelegatedApprovalPolicy;
    }

    const approvalPolicy = await approvalPolicyDAL.findById(policyId, tx);
    if (!approvalPolicy) {
      throw new NotFoundError({ message: `Approval policy with ID '${policyId}' not found` });
    }
    assertPolicyTypeSupportsDelegatedApproval(approvalPolicy.type);

    await $assertConnectionMatches(
      { type: newType, connectionId: newConnectionId, organizationId: approvalPolicy.organizationId },
      tx
    );

    const [policy] = await delegatedApprovalPolicyDAL.update(
      { policyId },
      { type: newType, connectionId: newConnectionId },
      tx
    );
    return policy as TDelegatedApprovalPolicy;
  };

  const deletePolicyByPolicyId = async (policyId: string, tx?: Knex) => {
    const [policy] = await delegatedApprovalPolicyDAL.delete({ policyId }, tx);
    return (policy as TDelegatedApprovalPolicy | undefined) ?? null;
  };

  const createRequest = async (
    {
      requestId,
      status = DelegatedApprovalRequestStatus.PendingDispatch,
      statusReason
    }: TCreateDelegatedApprovalRequestDTO,
    tx?: Knex
  ) => {
    const approvalRequest = await approvalRequestDAL.findById(requestId, tx);
    if (!approvalRequest) {
      throw new NotFoundError({ message: `Approval request with ID '${requestId}' not found` });
    }

    try {
      const request = await delegatedApprovalRequestDAL.create({ requestId, status, statusReason }, tx);
      return request as TDelegatedApprovalRequest;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new BadRequestError({
          message: `Approval request with ID '${requestId}' already has a delegated approval request`
        });
      }
      throw err;
    }
  };

  const getRequestByRequestId = async (requestId: string, tx?: Knex) => {
    const request = await delegatedApprovalRequestDAL.findOne({ requestId }, tx);
    return (request as TDelegatedApprovalRequest | undefined) ?? null;
  };

  const updateRequest = async ({ requestId, status, statusReason }: TUpdateDelegatedApprovalRequestDTO, tx?: Knex) => {
    const patch = {
      ...(status !== undefined && { status }),
      ...(statusReason !== undefined && { statusReason })
    };

    if (Object.keys(patch).length === 0) {
      const existing = await delegatedApprovalRequestDAL.findOne({ requestId }, tx);
      if (!existing) {
        throw new NotFoundError({
          message: `Approval request with ID '${requestId}' has no delegated approval request`
        });
      }
      return existing as TDelegatedApprovalRequest;
    }

    const [request] = await delegatedApprovalRequestDAL.update({ requestId }, patch, tx);
    if (!request) {
      throw new NotFoundError({ message: `Approval request with ID '${requestId}' has no delegated approval request` });
    }
    return request as TDelegatedApprovalRequest;
  };

  const deleteRequestByRequestId = async (requestId: string, tx?: Knex) => {
    const [request] = await delegatedApprovalRequestDAL.delete({ requestId }, tx);
    return (request as TDelegatedApprovalRequest | undefined) ?? null;
  };

  return {
    listDelegatedApprovalOptions,
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
