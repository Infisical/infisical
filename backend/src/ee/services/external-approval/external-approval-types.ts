import { TExternalApprovalPolicies, TExternalApprovalRequests, TProjects } from "@app/db/schemas";
import { OrgServiceActor } from "@app/lib/types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { decryptAppConnection } from "@app/services/app-connection/app-connection-fns";

import { TAccessApprovalRequestDALFactory } from "../access-approval-request/access-approval-request-dal";
import { ApprovalStatus } from "../access-approval-request/access-approval-request-types";
import { ExternalApprovalType } from "./external-approval-enums";

export type TExternalApprovalPolicyInput = {
  type: ExternalApprovalType;
  connectionId: string;
  approverIdentityId?: string | null;
};

export type TValidateExternalApprovalPolicyInputDTO = {
  input: TExternalApprovalPolicyInput;
  projectId: string;
  actor: OrgServiceActor;
};

export type TListApproverIdentitiesDTO = {
  projectId: string;
  actor: OrgServiceActor;
};

export type TCanReviewExternalApprovalsDTO = {
  actor: Pick<OrgServiceActor, "type" | "id" | "authMethod" | "orgId">;
};

export type TExternalApprovalDecision = ApprovalStatus.APPROVED | ApprovalStatus.REJECTED;

export type TAuthorizeExternalReviewDTO = {
  externalApprovalPolicyId: string;
  actor: OrgServiceActor;
};

export type TResolveExternalApprovalDecisionDTO = {
  externalApprovalRequestId: string;
  externalId: string;
  status: TExternalApprovalDecision;
};

export type TExternalApprovalDispatchJobPayload = {
  externalApprovalRequestId: string;
  accessApprovalRequestId: string;
  projectId: string;
};

export type TDecryptedExternalApprovalConnection = Awaited<ReturnType<typeof decryptAppConnection>>;

export type TExternalApprovalDispatchContext = {
  externalApprovalRequest: TExternalApprovalRequests;
  externalApprovalPolicy: TExternalApprovalPolicies;
  accessApprovalRequest: NonNullable<Awaited<ReturnType<TAccessApprovalRequestDALFactory["findById"]>>>;
  connection: TDecryptedExternalApprovalConnection;
  project: Pick<TProjects, "id" | "name" | "orgId" | "slug">;
};

export type TExternalApprovalDispatchResult = {
  externalId: string | null;
};

export type TExternalApprovalProviderFns = {
  type: ExternalApprovalType;
  app: AppConnection;
  dispatch: (context: TExternalApprovalDispatchContext) => Promise<TExternalApprovalDispatchResult>;
};
