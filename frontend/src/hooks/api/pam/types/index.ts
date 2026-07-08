import { OrderByDirection } from "../../generic/types";
import {
  PamAccessRequestDecision,
  PamAccessStatus,
  PamAccountOrderBy,
  PamAccountType,
  PamAccountView,
  PamApproverType,
  PamNotificationEvent,
  PamPolicyType,
  PamResourcePermissionActions,
  PamResourcePermissionSub,
  PamSessionStatus,
  SessionChannelType
} from "../enums";

export type PamFolderPermissionSet = [
  PamResourcePermissionActions,
  PamResourcePermissionSub.PamResource
];

export enum PamFieldWidget {
  Text = "text",
  Number = "number",
  Boolean = "boolean",
  Select = "select",
  Textarea = "textarea",
  Password = "password"
}

export type TPamFieldDescriptor = {
  key: string;
  label: string;
  widget: PamFieldWidget;
  required: boolean;
  secret: boolean;
  options?: { label: string; value: string }[];
  defaultValue?: string | number | boolean;
  showWhen?: { field: string; equals: string | boolean };
  tooltip?: string;
};

export type TPamPolicyDescriptor = {
  key: PamPolicyType;
  label: string;
  description: string;
};

export type TPamAccountTypeMetadata = {
  type: PamAccountType;
  name: string;
  icon: string;
  supportsWebAccess: boolean;
  requiresGateway: boolean;
  connectionFields: TPamFieldDescriptor[];
  credentialFields: TPamFieldDescriptor[];
  applicablePolicies: TPamPolicyDescriptor[];
};

export type TPamAccessResponse = {
  sessionId: string;
  accountType: string;
  metadata?: Record<string, string>;
};

// New model types

export enum PamAccountAccessibilityIssue {
  NoGateway = "no-gateway",
  NoRecordingConfig = "no-recording-config",
  NoCredential = "no-credential",
  NoApprovalConfig = "no-approval-config"
}

export const accountTypeRequiresRecording = (type: PamAccountType): boolean =>
  type === PamAccountType.Windows || type === PamAccountType.WindowsAd;

export type TPamAccountSettingsOverrides = {
  recordingS3Config?: { bucket: string; region: string; keyPrefix?: string };
};

export type TPamAccount = {
  id: string;
  name: string;
  description: string | null;
  folderId: string;
  folderName: string | null;
  templateId: string;
  templateName: string;
  templatePolicies: unknown;
  templateSettings: unknown;
  accountType: PamAccountType;
  gatewayId: string | null;
  gatewayPoolId: string | null;
  recordingConnectionId: string | null;
  settingsOverrides: TPamAccountSettingsOverrides | null;
  connectionDetails: Record<string, unknown>;
  // Non-secret credential fields only
  credentials: Record<string, unknown>;
  isAccessible: boolean;
  accessibilityIssues: PamAccountAccessibilityIssue[];
  createdAt: string;
  updatedAt: string;
};

export type TPamFolder = {
  id: string;
  parentId?: string | null;
  name: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TPamAccountTemplate = {
  id: string;
  name: string;
  description?: string | null;
  type: PamAccountType;
  policies: unknown;
  settings: unknown;
  gatewayId?: string | null;
  gatewayPoolId?: string | null;
  recordingConnectionId?: string | null;
  createdAt: string;
  updatedAt: string;
};

// Session log types

export type TPamCommandLog = {
  input: string;
  output: string;
  timestamp: string;
};

export type TSessionEvent = {
  timestamp: string;
  eventType: "input" | "output" | "resize" | "error";
  channelType?: SessionChannelType;
  data: string;
  elapsedTime: number;
};

export type THttpRequestEvent = {
  timestamp: string;
  requestId: string;
  eventType: "request";
  headers: Record<string, string[]>;
  method: string;
  url: string;
  body?: string;
};

export type THttpResponseEvent = {
  timestamp: string;
  requestId: string;
  eventType: "response";
  headers: Record<string, string[]>;
  status: string;
  body?: string;
};

export type THttpEvent = THttpRequestEvent | THttpResponseEvent;

export type TPamSessionLog = TPamCommandLog | TSessionEvent | THttpEvent;

export type TPamSessionAiInsights = {
  summary: string;
  warnings: { text: string; logIndex?: number }[];
};

export type TPamSession = {
  id: string;
  accountId?: string | null;
  accountType: PamAccountType;
  accountName: string;
  folderId?: string | null;
  folderName?: string | null;
  resourceName?: string | null;
  selectedHost?: string | null;
  accessMethod?: string | null;
  userId?: string | null;
  actorName: string;
  actorEmail: string;
  actorIp: string;
  actorUserAgent: string;
  status: PamSessionStatus;
  expiresAt?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  gatewayIdentityId?: string | null;
  gatewayId?: string | null;
  aiInsightsStatus?: string | null;
  aiInsightsError?: string | null;
  aiInsights?: TPamSessionAiInsights | null;
  reason?: string | null;
};

export type TAccessiblePamAccount = {
  id: string;
  name: string;
  description: string | null;
  folderId: string | null;
  templateId: string;
  folderName: string | null;
  templateName: string;
  accountType: PamAccountType;
  canLaunch: boolean;
  requiresApproval?: boolean;
  requireReason?: boolean;
  accessStatus?: PamAccessStatus;
  grantExpiresAt?: string | null;
  disabledReason?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TListAccessiblePamAccountsDTO = {
  offset?: number;
  limit?: number;
  search?: string;
  folderId?: string;
  accountType?: string;
};

// Account DTOs

export type TListPamAccountsDTO = {
  projectId: string;
  accountView?: PamAccountView;
  offset?: number;
  limit?: number;
  orderBy?: PamAccountOrderBy;
  orderDirection?: OrderByDirection;
  search?: string;
};

export type TCreatePamFolderDTO = {
  name: string;
  description?: string;
};

export type TUpdatePamFolderDTO = Partial<Pick<TPamFolder, "name" | "description">> & {
  folderId: string;
};

export type TDeletePamFolderDTO = {
  folderId: string;
};

export type TPamFolderWithCount = TPamFolder & { accountCount: number };

export type TCreatePamAccountDTO = {
  accountType: PamAccountType;
  name: string;
  description?: string;
  folderId: string;
  templateId: string;
  connectionDetails: Record<string, unknown>;
  credentials: Record<string, unknown>;
  gatewayId?: string;
  gatewayPoolId?: string;
  recordingConnectionId?: string;
};

export type TUpdatePamAccountDTO = {
  accountId: string;
  accountType: PamAccountType;
  name?: string;
  description?: string | null;
  folderId?: string;
  templateId?: string;
  connectionDetails?: Record<string, unknown>;
  credentials?: Record<string, unknown>;
  gatewayId?: string | null;
  gatewayPoolId?: string | null;
  recordingConnectionId?: string | null;
  settingsOverrides?: TPamAccountSettingsOverrides | null;
};

export type TDeletePamAccountDTO = {
  accountId: string;
  accountType: PamAccountType;
};

export type TPamAccountTemplateWithCount = TPamAccountTemplate & { accountCount: number };

export type TPamAccountTemplateDetail = TPamAccountTemplate & {
  accountCount: number;
  rotationImpact: { willRotate: number; needsRotationAccount: number };
};

export type TListPamAccountTemplatesDTO = {
  search?: string;
  type?: PamAccountType;
};

export type TCreatePamAccountTemplateDTO = {
  name: string;
  description?: string;
  type: PamAccountType;
  policies?: Record<string, unknown>;
  settings?: Record<string, unknown>;
};

export type TUpdatePamAccountTemplateDTO = {
  templateId: string;
  name?: string;
  description?: string | null;
  policies?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  gatewayId?: string | null;
  gatewayPoolId?: string | null;
  recordingConnectionId?: string | null;
};

export type TDeletePamAccountTemplateDTO = {
  templateId: string;
};

export type TPamMember = {
  membershipId: string;
  userId?: string | null;
  identityId?: string | null;
  groupId?: string | null;
  role: string;
  isActive: boolean;
  expiresAt?: string | null;
  createdAt: string;
};

export type TPamResourceRole = {
  slug: string;
  name: string;
  isDefault?: boolean;
  description?: string;
};

export type TPamMembersData = {
  users: TPamMember[];
  groups: TPamMember[];
  identities: TPamMember[];
};

export type TAddAccountUserMemberDTO = {
  accountId: string;
  userId: string;
  role: string;
  expiry?: string | null;
};

export type TUpdateAccountMemberRoleDTO = {
  accountId: string;
  userId: string;
  role: string;
};

export type TRemoveAccountMemberDTO = {
  accountId: string;
  userId: string;
};

export type TAddAccountGroupMemberDTO = {
  accountId: string;
  groupId: string;
  role: string;
  expiry?: string | null;
};

export type TUpdateAccountGroupMemberRoleDTO = {
  accountId: string;
  groupId: string;
  role: string;
};

export type TRemoveAccountGroupMemberDTO = {
  accountId: string;
  groupId: string;
};

export type TAddFolderUserMemberDTO = {
  folderId: string;
  userId: string;
  role: string;
  expiry?: string | null;
};

export type TUpdateFolderMemberRoleDTO = {
  folderId: string;
  userId: string;
  role: string;
};

export type TRemoveFolderMemberDTO = {
  folderId: string;
  userId: string;
};

export type TAddFolderGroupMemberDTO = {
  folderId: string;
  groupId: string;
  role: string;
  expiry?: string | null;
};

export type TUpdateFolderGroupMemberRoleDTO = {
  folderId: string;
  groupId: string;
  role: string;
};

export type TRemoveFolderGroupMemberDTO = {
  folderId: string;
  groupId: string;
};

export type TAddAccountIdentityMemberDTO = {
  accountId: string;
  identityId: string;
  role: string;
  expiry?: string | null;
};

export type TUpdateAccountIdentityMemberRoleDTO = {
  accountId: string;
  identityId: string;
  role: string;
};

export type TRemoveAccountIdentityMemberDTO = {
  accountId: string;
  identityId: string;
};

export type TAddFolderIdentityMemberDTO = {
  folderId: string;
  identityId: string;
  role: string;
  expiry?: string | null;
};

export type TUpdateFolderIdentityMemberRoleDTO = {
  folderId: string;
  identityId: string;
  role: string;
};

export type TRemoveFolderIdentityMemberDTO = {
  folderId: string;
  identityId: string;
};

export type TAddPamProductIdentityMemberDTO = {
  identityId: string;
  role: string;
  projectId: string;
};

export type TUpdatePamProductIdentityMemberDTO = {
  identityId: string;
  role: string;
  projectId: string;
};

export type TRemovePamProductIdentityMemberDTO = {
  identityId: string;
  projectId: string;
};

// Credential rotation

export type TPamPasswordRequirements = {
  length: number;
  required: { lowercase: number; uppercase: number; digits: number; symbols: number };
  allowedSymbols?: string;
};

export type TPamAccountRotation = {
  enabled: boolean;
  intervalSeconds: number | null;
  passwordRequirements: TPamPasswordRequirements | null;
  rotationAccountId: string | null;
  rotationAccountName: string | null;
  lastRotatedAt: string | null;
  rotationStatus: string | null;
  lastRotationError: string | null;
  isReady: boolean;
};

export type TPamRotationCandidateGroup = {
  folderId: string | null;
  folderName: string | null;
  accounts: { id: string; name: string; host: string }[];
};

export type TUpdatePamAccountRotationDTO = {
  accountId: string;
  rotationAccountId: string | null;
};

export type TRotatePamAccountDTO = {
  accountId: string;
};

// Access Requests / Approvals

export type TPamAccessRequest = {
  id: string;
  projectId: string;
  policyId: string;
  requesterId: string | null;
  requesterName: string;
  requesterEmail: string;
  type: string;
  status: string;
  justification: string | null;
  currentStep: number;
  requestData: {
    version: number;
    requestData: {
      accountId: string;
      folderId: string;
      reason?: string;
      duration: string;
    };
  } | null;
  expiresAt: string | null;
  scopeType: string | null;
  scopeId: string | null;
  createdAt: string;
  updatedAt: string;
  // joined fields (populated by backend list endpoints)
  accountName?: string;
  accountType?: PamAccountType;
  folderName?: string;
  host?: string;
  grantExpiresAt?: string | null;
  grantStatus?: string | null;
};

export type TPamNotificationConfig = {
  workflowIntegrationId: string;
  channels: { id: string; name: string }[];
  events: PamNotificationEvent[];
};

export type TPamApprovalConfig = {
  steps: {
    approvers: { type: PamApproverType; id: string }[];
  }[];
  notificationConfigs: (TPamNotificationConfig & {
    id: string;
    integration: string;
    integrationSlug: string;
  })[];
};

export type TPamAccessGrant = {
  id: string;
  requestId: string;
  granteeUserId: string | null;
  status: string;
  expiresAt: string | null;
  revokedAt: string | null;
  attributes: {
    accountId?: string;
    folderId?: string;
  } | null;
  createdAt: string;
};

export type TCreatePamAccessRequestDTO = {
  accountId: string;
  reason?: string;
  duration: string;
};

export type TReviewPamAccessRequestDTO = {
  requestId: string;
  status: PamAccessRequestDecision;
  comment?: string;
};

export type TRevokePamAccessRequestDTO = {
  requestId: string;
};

export type TSetPamApprovalConfigDTO = {
  folderId: string;
  steps: {
    approvers: { type: PamApproverType; id: string }[];
  }[];
  notificationConfigs?: TPamNotificationConfig[];
};
