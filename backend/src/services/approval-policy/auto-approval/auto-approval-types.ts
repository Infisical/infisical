import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

// Conditions on the requester's own account in a service carry this subject and no input
export const AUTO_APPROVAL_REQUESTER_SUBJECT = "requester";

export enum AutoApprovalConstraintValue {
  None = "none",
  One = "one",
  Many = "many"
}

export type TAutoApprovalOption = { value: string; label: string };

export type TAutoApprovalProviderDeps = {
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  gatewayPoolService: Pick<TGatewayPoolServiceFactory, "runWithPoolFailover">;
  signal?: AbortSignal;
};

// Infisical runs this check itself, against its own approved requests, on every record a requester links
export const AUTO_APPROVAL_UNUSED_CONSTRAINT = "not-used-before";
export const AUTO_APPROVAL_UNUSED_CONSTRAINT_LABEL = "hasn't been used before";

export type TAutoApprovalContext = {
  requester: {
    email: string | null;
  };
};

export type TAutoApprovalTestResult = { pass: boolean; reason?: string };

export type TAutoApprovalConstraint<TConn, TFacts> = {
  label: string;
  value: AutoApprovalConstraintValue;
  // Picker values, filtered by search and by the values picked in the rule's other conditions
  listOptions?: (
    conn: TConn,
    args: { search?: string; siblings: Record<string, string[]> },
    deps: TAutoApprovalProviderDeps
  ) => Promise<TAutoApprovalOption[]>;
  // Pure; the reason is shown to requesters and approvers
  test: (facts: TFacts, values: string[], ctx: TAutoApprovalContext) => TAutoApprovalTestResult;
};

export type TAutoApprovalSubjectInput<TConn> = {
  label: string;
  placeholder: string;
  // Throws a BadRequestError naming the expected format, or the site the value should point at
  parse: (userInput: string, conn: TConn) => string;
  getUrl?: (id: string, conn: TConn) => string;
};

export type TAutoApprovalSubject<TConn, TFacts> = {
  label: string;
  input: TAutoApprovalSubjectInput<TConn> | null;
  // Fetches the subject once per request, limited to what the constraints in use need. id is null for
  // the requester, who is found through ctx. Throws a BadRequestError whose message is the reason shown.
  resolve: (
    conn: TConn,
    id: string | null,
    ctx: TAutoApprovalContext,
    constraintIds: string[],
    deps: TAutoApprovalProviderDeps
  ) => Promise<TFacts>;
  constraints: Record<string, TAutoApprovalConstraint<TConn, TFacts>>;
  // An ID that survives renames and moves, so linking the same record under another name still counts as reuse
  getStableId?: (facts: TFacts) => string | null;
};

export type TAutoApprovalProvider<TConn = unknown> = {
  app: AppConnection;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  subjects: Record<string, TAutoApprovalSubject<TConn, any>>;
};

export type TAutoApprovalInputConfig = { connectionId: string; subject: string };

export type TAutoApprovalConditionConfig = {
  connectionId: string;
  subject: string;
  constraint: string;
  values: string[];
};

export type TAutoApprovalRuleConfig = { name: string; conditions: TAutoApprovalConditionConfig[] };

export type TAutoApprovalConfig = {
  inputs: TAutoApprovalInputConfig[];
  rules: TAutoApprovalRuleConfig[];
};

export type TStoredAutoApproval = {
  inputs: (TAutoApprovalInputConfig & { id: string })[];
  rules: {
    id: string;
    name: string;
    conditions: (TAutoApprovalConditionConfig & { id: string; inputId: string | null })[];
  }[];
};

export type TAutoApprovalPolicyResponse = {
  inputs: (TAutoApprovalInputConfig & { id: string })[];
  rules: { id: string; name: string; conditions: (TAutoApprovalConditionConfig & { id: string })[] }[];
};

export type TAutoApprovalInputValue = { connectionId: string; subject: string; value: string };

export type TParsedAutoApprovalInput = {
  inputId: string;
  connectionId: string;
  subject: string;
  label: string;
  value: string;
  id: string;
  url: string | null;
};

// Snapshot taken at evaluation, so a request still reads correctly after the rules change
export type TAutoApprovalEvidence = {
  version: 1;
  evaluatedAt: string;
  approvedByRuleId: string | null;
  inputs: (TParsedAutoApprovalInput & { stableId: string })[];
  subjects: {
    connectionId: string;
    subject: string;
    inputId: string | null;
    // The service's data as fetched; kept for audit and never returned by the API
    facts: unknown;
    error: string | null;
  }[];
  rules: {
    id: string;
    name: string;
    passed: boolean;
    conditions: {
      id: string;
      connectionId: string;
      subject: string;
      constraint: string;
      values: string[];
      description: string;
      passed: boolean;
      reason: string | null;
    }[];
  }[];
};

export type TAutoApprovalOutcome = {
  approvedAt: Date | null;
  approvedByRuleId: string | null;
  inputs: { label: string; value: string; url: string | null }[];
  rules: {
    id: string;
    name: string;
    passed: boolean;
    conditions: { id: string; description: string; passed: boolean; reason: string | null }[];
  }[];
};
