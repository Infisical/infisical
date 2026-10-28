import crypto from "node:crypto";

import { Knex } from "knex";

import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { hasPostgresErrorCode } from "@app/lib/errors/postgres";
import { OrgServiceActor } from "@app/lib/types";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { enterpriseAppCheck } from "@app/services/app-connection/app-connection-fns";
import { APP_CONNECTION_NAME_MAP } from "@app/services/app-connection/app-connection-maps";
import { TAppConnectionServiceFactory } from "@app/services/app-connection/app-connection-service";
import { TApprovalPolicyDALFactory } from "@app/services/approval-policy/approval-policy-dal";
import { TEventEmitter } from "@app/services/event-outbox/event-outbox-types";

import { DelegatedApprovalPolicyType, DelegatedApprovalRequestStatus } from "./delegated-approval-enums";
import { emitDelegatedApprovalDispatchRequested } from "./delegated-approval-events";
import { assertPolicyTypeSupportsDelegatedApproval, listDelegatedApprovalOptions } from "./delegated-approval-fns";
import { DelegatedApprovalRequestBlocker, getDelegatedApprovalRequestBlocker } from "./delegated-approval-guards";
import { DELEGATED_APPROVAL_CONNECTION_MAP, DELEGATED_APPROVAL_NAME_MAP } from "./delegated-approval-maps";
import { TDelegatedApprovalPolicyDALFactory } from "./delegated-approval-policy-dal";
import { TDelegatedApprovalRequestDALFactory } from "./delegated-approval-request-dal";
import { toDelegatedApprovalRequest } from "./delegated-approval-request-fns";
import {
  TCreateDelegatedApprovalPolicyDTO,
  TCreateDelegatedApprovalRequestDTO,
  TDelegatedApprovalPolicy,
  TRetryDelegatedApprovalRequestDispatchDTO,
  TUpdateDelegatedApprovalPolicyDTO,
  TValidateDelegatedApprovalConnectionDTO
} from "./delegated-approval-types";

type TDelegatedApprovalServiceFactoryDep = {
  delegatedApprovalPolicyDAL: TDelegatedApprovalPolicyDALFactory;
  delegatedApprovalRequestDAL: TDelegatedApprovalRequestDALFactory;
  approvalPolicyDAL: Pick<TApprovalPolicyDALFactory, "findById">;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
  appConnectionService: Pick<TAppConnectionServiceFactory, "validateAppConnectionUsageById">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  eventEmitter: TEventEmitter;
};

const RETRY_DISPATCH_BLOCKER_MESSAGES: Record<DelegatedApprovalRequestBlocker, string> = {
  [DelegatedApprovalRequestBlocker.Missing]: "Only pending requests can be sent again",
  [DelegatedApprovalRequestBlocker.NotPending]: "Only pending requests can be sent again",
  [DelegatedApprovalRequestBlocker.Expired]: "This request has expired. Create a new request instead.",
  [DelegatedApprovalRequestBlocker.PolicyRemoved]:
    "The policy for this request no longer uses an external approval system. Create a new request instead."
};

export type TDelegatedApprovalServiceFactory = ReturnType<typeof delegatedApprovalServiceFactory>;

export const delegatedApprovalServiceFactory = ({
  delegatedApprovalPolicyDAL,
  delegatedApprovalRequestDAL,
  approvalPolicyDAL,
  appConnectionDAL,
  appConnectionService,
  licenseService,
  eventEmitter
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

  const assertPlanAllowsPolicyEdit = async (type: DelegatedApprovalPolicyType, orgId: string) => {
    await enterpriseAppCheck(
      licenseService,
      DELEGATED_APPROVAL_CONNECTION_MAP[type],
      orgId,
      `Failed to update policy: ${DELEGATED_APPROVAL_NAME_MAP[type]} delegated approval is only available on plans with enterprise app connections. Upgrade your plan, or remove the delegated approver to edit this policy.`
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
      if (hasPostgresErrorCode(err, DatabaseErrorCode.UniqueViolation)) {
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

  const createRequest = async ({ approvalRequest, delegatedPolicy }: TCreateDelegatedApprovalRequestDTO, tx?: Knex) => {
    assertPolicyTypeSupportsDelegatedApproval(approvalRequest.type);

    const dispatchEventId = crypto.randomUUID();
    try {
      const request = await delegatedApprovalRequestDAL.create(
        {
          requestId: approvalRequest.id,
          providerType: delegatedPolicy.type,
          status: DelegatedApprovalRequestStatus.PendingDispatch,
          details: {},
          dispatchEventId
        },
        tx
      );
      await emitDelegatedApprovalDispatchRequested(
        eventEmitter,
        { delegatedRequestId: request.id, dispatchEventId },
        tx
      );
      return toDelegatedApprovalRequest(request);
    } catch (err) {
      if (hasPostgresErrorCode(err, DatabaseErrorCode.UniqueViolation)) {
        throw new BadRequestError({
          message: `Approval request with ID '${approvalRequest.id}' already has a delegated approval request`
        });
      }
      if (hasPostgresErrorCode(err, DatabaseErrorCode.ForeignKeyViolation)) {
        throw new NotFoundError({ message: `Approval request with ID '${approvalRequest.id}' not found` });
      }
      throw err;
    }
  };

  const getRequestByRequestId = async (requestId: string, tx?: Knex) => {
    const request = await delegatedApprovalRequestDAL.findOne({ requestId }, tx);
    return request ? toDelegatedApprovalRequest(request) : null;
  };

  const getRequestsByRequestIds = async (requestIds: string[], tx?: Knex) => {
    if (!requestIds.length) return [];
    const requests = await delegatedApprovalRequestDAL.find({ $in: { requestId: requestIds } }, { tx });
    return requests.map(toDelegatedApprovalRequest);
  };

  const retryDispatch = async ({ approvalRequest }: TRetryDelegatedApprovalRequestDispatchDTO) => {
    const delegatedRequest = await getRequestByRequestId(approvalRequest.id, delegatedApprovalRequestDAL.primaryNode());
    if (!delegatedRequest) {
      throw new BadRequestError({
        message: `Request with ID '${approvalRequest.id}' is not reviewed in an external approval system`
      });
    }

    const delegatedPolicy = approvalRequest.policyId ? await getPolicyByPolicyId(approvalRequest.policyId) : null;
    const blocker = getDelegatedApprovalRequestBlocker(approvalRequest, delegatedPolicy);
    if (blocker || !delegatedPolicy) {
      throw new BadRequestError({
        message: RETRY_DISPATCH_BLOCKER_MESSAGES[blocker ?? DelegatedApprovalRequestBlocker.PolicyRemoved]
      });
    }

    const notResendableError = new BadRequestError({
      message: `Only requests that failed to reach ${DELEGATED_APPROVAL_NAME_MAP[delegatedPolicy.type]} can be sent again`
    });

    if (delegatedRequest.status !== DelegatedApprovalRequestStatus.FailedDispatch) {
      throw notResendableError;
    }

    // Conditional on failed_dispatch so it serializes with the consumer reopening the row for the event this
    // replaces: whichever takes the row first wins, and the other backs off.
    const dispatchEventId = crypto.randomUUID();
    const resentRequest = await delegatedApprovalRequestDAL.transaction(async (tx) => {
      const [resent] = await delegatedApprovalRequestDAL.update(
        { id: delegatedRequest.id, status: DelegatedApprovalRequestStatus.FailedDispatch },
        { dispatchEventId },
        tx
      );
      if (!resent) throw notResendableError;

      await emitDelegatedApprovalDispatchRequested(
        eventEmitter,
        { delegatedRequestId: resent.id, dispatchEventId },
        tx
      );
      return toDelegatedApprovalRequest(resent);
    });

    return { delegatedRequest: resentRequest, delegatedPolicy };
  };

  const deleteRequestByRequestId = async (requestId: string, tx?: Knex) => {
    const [request] = await delegatedApprovalRequestDAL.delete({ requestId }, tx);
    return request ? toDelegatedApprovalRequest(request) : null;
  };

  return {
    listDelegatedApprovalOptions,
    validateConnection,
    assertPlanAllowsPolicyEdit,
    createPolicy,
    getPolicyByPolicyId,
    updatePolicy,
    deletePolicyByPolicyId,
    createRequest,
    getRequestByRequestId,
    getRequestsByRequestIds,
    retryDispatch,
    deleteRequestByRequestId
  };
};
