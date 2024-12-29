import { PureAbility } from "@casl/ability";
import { ZodIssue } from "zod";

export type { TAccessApprovalPolicy } from "./accessApproval/types";
export type { TAuditLogStream } from "./auditLogStreams/types";
export type { GetAuthTokenAPI } from "./auth/types";
export type { IncidentContact } from "./incidentContacts/types";
export type { IntegrationAuth } from "./integrationAuth/types";
export type { TCloudIntegration, TIntegration } from "./integrations/types";
export type { UserWsKeyPair } from "./keys/types";
export type { Organization } from "./organization/types";
export type { TSecretApprovalPolicy } from "./secretApproval/types";
export type {
  TGetSecretApprovalRequestDetails,
  TSecretApprovalRequest,
  TSecretApprovalSecChange
} from "./secretApprovalRequest/types";
export { ApprovalStatus, CommitType } from "./secretApprovalRequest/types";
export type { TSecretFolder } from "./secretFolders/types";
export type { TImportedSecrets, TSecretImport } from "./secretImports/types";
export type {
  TGetSecretRotationProviders,
  TSecretRotationProviderList,
  TSecretRotationProviderTemplate
} from "./secretRotation/types";
export * from "./secrets/types";
export type { CreateServiceTokenDTO, ServiceToken } from "./serviceTokens/types";
export type { SubscriptionPlan } from "./subscriptions/types";
export type { WsTag } from "./tags/types";
export type { AddUserToWsDTOE2EE, OrgUser, TWorkspaceUser, User, UserEnc } from "./users/types";
export type { TWebhook } from "./webhooks/types";
export type {
  CreateEnvironmentDTO,
  CreateWorkspaceDTO,
  DeleteEnvironmentDTO,
  DeleteWorkspaceDTO,
  ToggleAutoCapitalizationDTO,
  UpdateEnvironmentDTO,
  UpdateProjectDTO,
  Workspace,
  WorkspaceEnv,
  WorkspaceTag
} from "./workspace/types";

export enum ApiErrorTypes {
  ValidationError = "ValidationFailure",
  BadRequestError = "BadRequest",
  UnauthorizedError = "UnauthorizedError",
  ForbiddenError = "PermissionDenied"
}

export type TApiErrors =
  | {
      reqId: string;
      error: ApiErrorTypes.ValidationError;
      message: ZodIssue[];
      statusCode: 422;
    }
  | {
      reqId: string;
      error: ApiErrorTypes.UnauthorizedError;
      message: string;
      statusCode: 401;
    }
  | {
      reqId: string;
      error: ApiErrorTypes.ForbiddenError;
      message: string;
      details: PureAbility["rules"];
      statusCode: 403;
    }
  | {
      reqId: string;
      statusCode: 400;
      message: string;
      error: ApiErrorTypes.BadRequestError;
    };
