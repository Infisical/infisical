import { Level } from "level";
import { TableName } from "./schemas";
import dotenv from "dotenv";
import PromptSync from "prompt-sync";
import mongoose from "mongoose";
import knex from "knex";
import path from "path";
import { v4 as uuidV4 } from "uuid";
import { getFolderKv, migrateCollection, truncateAndSlugify } from ".";
import { ActorType, AuditLog } from "./models";

export type TCreateAuditLogDTO = {
  event: Event;
  actor: UserActor | IdentityActor | ServiceActor;
  orgId?: string;
  projectId?: string;
} & BaseAuthData;

interface BaseAuthData {
  ipAddress?: string;
  userAgent?: string;
  userAgentType?: UserAgentType;
}

export enum UserAgentType {
  WEB = "web",
  CLI = "cli",
  K8_OPERATOR = "k8-operator",
  TERRAFORM = "terraform",
  OTHER = "other",
  PYTHON_SDK = "InfisicalPythonSDK",
  NODE_SDK = "InfisicalNodeSDK",
}

export enum EventType {
  GET_SECRETS = "get-secrets",
  GET_SECRET = "get-secret",
  REVEAL_SECRET = "reveal-secret",
  CREATE_SECRET = "create-secret",
  CREATE_SECRETS = "create-secrets",
  UPDATE_SECRET = "update-secret",
  UPDATE_SECRETS = "update-secrets",
  DELETE_SECRET = "delete-secret",
  DELETE_SECRETS = "delete-secrets",
  GET_WORKSPACE_KEY = "get-workspace-key",
  AUTHORIZE_INTEGRATION = "authorize-integration",
  UNAUTHORIZE_INTEGRATION = "unauthorize-integration",
  CREATE_INTEGRATION = "create-integration",
  DELETE_INTEGRATION = "delete-integration",
  ADD_TRUSTED_IP = "add-trusted-ip",
  UPDATE_TRUSTED_IP = "update-trusted-ip",
  DELETE_TRUSTED_IP = "delete-trusted-ip",
  CREATE_SERVICE_TOKEN = "create-service-token", // v2
  DELETE_SERVICE_TOKEN = "delete-service-token", // v2
  CREATE_IDENTITY = "create-identity",
  UPDATE_IDENTITY = "update-identity",
  DELETE_IDENTITY = "delete-identity",
  LOGIN_IDENTITY_UNIVERSAL_AUTH = "login-identity-universal-auth",
  ADD_IDENTITY_UNIVERSAL_AUTH = "add-identity-universal-auth",
  UPDATE_IDENTITY_UNIVERSAL_AUTH = "update-identity-universal-auth",
  GET_IDENTITY_UNIVERSAL_AUTH = "get-identity-universal-auth",
  CREATE_IDENTITY_UNIVERSAL_AUTH_CLIENT_SECRET = "create-identity-universal-auth-client-secret",
  REVOKE_IDENTITY_UNIVERSAL_AUTH_CLIENT_SECRET = "revoke-identity-universal-auth-client-secret",
  GET_IDENTITY_UNIVERSAL_AUTH_CLIENT_SECRETS = "get-identity-universal-auth-client-secret",
  CREATE_ENVIRONMENT = "create-environment",
  UPDATE_ENVIRONMENT = "update-environment",
  DELETE_ENVIRONMENT = "delete-environment",
  ADD_WORKSPACE_MEMBER = "add-workspace-member",
  ADD_BATCH_WORKSPACE_MEMBER = "add-workspace-members",
  REMOVE_WORKSPACE_MEMBER = "remove-workspace-member",
  CREATE_FOLDER = "create-folder",
  UPDATE_FOLDER = "update-folder",
  DELETE_FOLDER = "delete-folder",
  CREATE_WEBHOOK = "create-webhook",
  UPDATE_WEBHOOK_STATUS = "update-webhook-status",
  DELETE_WEBHOOK = "delete-webhook",
  GET_SECRET_IMPORTS = "get-secret-imports",
  CREATE_SECRET_IMPORT = "create-secret-import",
  UPDATE_SECRET_IMPORT = "update-secret-import",
  DELETE_SECRET_IMPORT = "delete-secret-import",
  UPDATE_USER_WORKSPACE_ROLE = "update-user-workspace-role",
  UPDATE_USER_WORKSPACE_DENIED_PERMISSIONS = "update-user-workspace-denied-permissions",
  SECRET_APPROVAL_MERGED = "secret-approval-merged",
  SECRET_APPROVAL_REQUEST = "secret-approval-request",
  SECRET_APPROVAL_CLOSED = "secret-approval-closed",
  SECRET_APPROVAL_REOPENED = "secret-approval-reopened",
}

interface UserActorMetadata {
  userId: string;
  email: string;
}

interface ServiceActorMetadata {
  serviceId: string;
  name: string;
}

interface IdentityActorMetadata {
  identityId: string;
  name: string;
}

export interface UserActor {
  type: ActorType.USER;
  metadata: UserActorMetadata;
}

export interface ServiceActor {
  type: ActorType.SERVICE;
  metadata: ServiceActorMetadata;
}

export interface IdentityActor {
  type: ActorType.IDENTITY;
  metadata: IdentityActorMetadata;
}

export type Actor = UserActor | ServiceActor | IdentityActor;

interface GetSecretsEvent {
  type: EventType.GET_SECRETS;
  metadata: {
    environment: string;
    secretPath: string;
    numberOfSecrets: number;
  };
}

interface GetSecretEvent {
  type: EventType.GET_SECRET;
  metadata: {
    environment: string;
    secretPath: string;
    secretId: string;
    secretKey: string;
    secretVersion: number;
  };
}

interface CreateSecretEvent {
  type: EventType.CREATE_SECRET;
  metadata: {
    environment: string;
    secretPath: string;
    secretId: string;
    secretKey: string;
    secretVersion: number;
  };
}

interface CreateSecretBatchEvent {
  type: EventType.CREATE_SECRETS;
  metadata: {
    environment: string;
    secretPath: string;
    secrets: Array<{
      secretId: string;
      secretKey: string;
      secretVersion: number;
    }>;
  };
}

interface UpdateSecretEvent {
  type: EventType.UPDATE_SECRET;
  metadata: {
    environment: string;
    secretPath: string;
    secretId: string;
    secretKey: string;
    secretVersion: number;
  };
}

interface UpdateSecretBatchEvent {
  type: EventType.UPDATE_SECRETS;
  metadata: {
    environment: string;
    secretPath: string;
    secrets: Array<{
      secretId: string;
      secretKey: string;
      secretVersion: number;
    }>;
  };
}

interface DeleteSecretEvent {
  type: EventType.DELETE_SECRET;
  metadata: {
    environment: string;
    secretPath: string;
    secretId: string;
    secretKey: string;
    secretVersion: number;
  };
}

interface DeleteSecretBatchEvent {
  type: EventType.DELETE_SECRETS;
  metadata: {
    environment: string;
    secretPath: string;
    secrets: Array<{
      secretId: string;
      secretKey: string;
      secretVersion: number;
    }>;
  };
}

interface GetWorkspaceKeyEvent {
  type: EventType.GET_WORKSPACE_KEY;
  metadata: {
    keyId: string;
  };
}

interface AuthorizeIntegrationEvent {
  type: EventType.AUTHORIZE_INTEGRATION;
  metadata: {
    integration: string;
  };
}

interface UnauthorizeIntegrationEvent {
  type: EventType.UNAUTHORIZE_INTEGRATION;
  metadata: {
    integration: string;
  };
}

interface CreateIntegrationEvent {
  type: EventType.CREATE_INTEGRATION;
  metadata: {
    integrationId: string;
    integration: string; // TODO: fix type
    environment: string;
    secretPath: string;
    url?: string;
    app?: string;
    appId?: string;
    targetEnvironment?: string;
    targetEnvironmentId?: string;
    targetService?: string;
    targetServiceId?: string;
    path?: string;
    region?: string;
  };
}

interface DeleteIntegrationEvent {
  type: EventType.DELETE_INTEGRATION;
  metadata: {
    integrationId: string;
    integration: string; // TODO: fix type
    environment: string;
    secretPath: string;
    url?: string;
    app?: string;
    appId?: string;
    targetEnvironment?: string;
    targetEnvironmentId?: string;
    targetService?: string;
    targetServiceId?: string;
    path?: string;
    region?: string;
  };
}

interface AddTrustedIPEvent {
  type: EventType.ADD_TRUSTED_IP;
  metadata: {
    trustedIpId: string;
    ipAddress: string;
    prefix?: number;
  };
}

interface UpdateTrustedIPEvent {
  type: EventType.UPDATE_TRUSTED_IP;
  metadata: {
    trustedIpId: string;
    ipAddress: string;
    prefix?: number;
  };
}

interface DeleteTrustedIPEvent {
  type: EventType.DELETE_TRUSTED_IP;
  metadata: {
    trustedIpId: string;
    ipAddress: string;
    prefix?: number;
  };
}

interface CreateServiceTokenEvent {
  type: EventType.CREATE_SERVICE_TOKEN;
  metadata: {
    name: string;
    scopes: Array<{
      environment: string;
      secretPath: string;
    }>;
  };
}

interface DeleteServiceTokenEvent {
  type: EventType.DELETE_SERVICE_TOKEN;
  metadata: {
    name: string;
    scopes: Array<{
      environment: string;
      secretPath: string;
    }>;
  };
}

interface CreateIdentityEvent {
  // note: currently not logging org-role
  type: EventType.CREATE_IDENTITY;
  metadata: {
    identityId: string;
    name: string;
  };
}

interface UpdateIdentityEvent {
  type: EventType.UPDATE_IDENTITY;
  metadata: {
    identityId: string;
    name?: string;
  };
}

interface DeleteIdentityEvent {
  type: EventType.DELETE_IDENTITY;
  metadata: {
    identityId: string;
  };
}

interface LoginIdentityUniversalAuthEvent {
  type: EventType.LOGIN_IDENTITY_UNIVERSAL_AUTH;
  metadata: {
    identityId: string;
    identityUniversalAuthId: string;
    clientSecretId: string;
    identityAccessTokenId: string;
  };
}
export enum IPType {
  IPV4 = "ipv4",
  IPV6 = "ipv6",
}

export interface TIdentityTrustedIp {
  ipAddress: string;
  type: IPType;
  prefix: number;
}

interface AddIdentityUniversalAuthEvent {
  type: EventType.ADD_IDENTITY_UNIVERSAL_AUTH;
  metadata: {
    identityId: string;
    clientSecretTrustedIps: Array<TIdentityTrustedIp>;
    accessTokenTTL: number;
    accessTokenMaxTTL: number;
    accessTokenNumUsesLimit: number;
    accessTokenTrustedIps: Array<TIdentityTrustedIp>;
  };
}

interface UpdateIdentityUniversalAuthEvent {
  type: EventType.UPDATE_IDENTITY_UNIVERSAL_AUTH;
  metadata: {
    identityId: string;
    clientSecretTrustedIps?: Array<TIdentityTrustedIp>;
    accessTokenTTL?: number;
    accessTokenMaxTTL?: number;
    accessTokenNumUsesLimit?: number;
    accessTokenTrustedIps?: Array<TIdentityTrustedIp>;
  };
}

interface GetIdentityUniversalAuthEvent {
  type: EventType.GET_IDENTITY_UNIVERSAL_AUTH;
  metadata: {
    identityId: string;
  };
}

interface CreateIdentityUniversalAuthClientSecretEvent {
  type: EventType.CREATE_IDENTITY_UNIVERSAL_AUTH_CLIENT_SECRET;
  metadata: {
    identityId: string;
    clientSecretId: string;
  };
}

interface GetIdentityUniversalAuthClientSecretsEvent {
  type: EventType.GET_IDENTITY_UNIVERSAL_AUTH_CLIENT_SECRETS;
  metadata: {
    identityId: string;
  };
}

interface RevokeIdentityUniversalAuthClientSecretEvent {
  type: EventType.REVOKE_IDENTITY_UNIVERSAL_AUTH_CLIENT_SECRET;
  metadata: {
    identityId: string;
    clientSecretId: string;
  };
}

interface CreateEnvironmentEvent {
  type: EventType.CREATE_ENVIRONMENT;
  metadata: {
    name: string;
    slug: string;
  };
}

interface UpdateEnvironmentEvent {
  type: EventType.UPDATE_ENVIRONMENT;
  metadata: {
    oldName: string;
    newName: string;
    oldSlug: string;
    newSlug: string;
    oldPos: number;
    newPos: number;
  };
}

interface DeleteEnvironmentEvent {
  type: EventType.DELETE_ENVIRONMENT;
  metadata: {
    name: string;
    slug: string;
  };
}

interface AddWorkspaceMemberEvent {
  type: EventType.ADD_WORKSPACE_MEMBER;
  metadata: {
    userId: string;
    email: string;
  };
}

interface AddBatchWorkspaceMemberEvent {
  type: EventType.ADD_BATCH_WORKSPACE_MEMBER;
  metadata: Array<{
    userId: string;
    email: string;
  }>;
}

interface RemoveWorkspaceMemberEvent {
  type: EventType.REMOVE_WORKSPACE_MEMBER;
  metadata: {
    userId: string;
    email: string;
  };
}

interface CreateFolderEvent {
  type: EventType.CREATE_FOLDER;
  metadata: {
    environment: string;
    folderId: string;
    folderName: string;
    folderPath: string;
  };
}

interface UpdateFolderEvent {
  type: EventType.UPDATE_FOLDER;
  metadata: {
    environment: string;
    folderId: string;
    oldFolderName: string;
    newFolderName: string;
    folderPath: string;
  };
}

interface DeleteFolderEvent {
  type: EventType.DELETE_FOLDER;
  metadata: {
    environment: string;
    folderId: string;
    folderName: string;
    folderPath: string;
  };
}

interface CreateWebhookEvent {
  type: EventType.CREATE_WEBHOOK;
  metadata: {
    webhookId: string;
    environment: string;
    secretPath: string;
    webhookUrl: string;
    isDisabled: boolean;
  };
}

interface UpdateWebhookStatusEvent {
  type: EventType.UPDATE_WEBHOOK_STATUS;
  metadata: {
    webhookId: string;
    environment: string;
    secretPath: string;
    webhookUrl: string;
    isDisabled: boolean;
  };
}

interface DeleteWebhookEvent {
  type: EventType.DELETE_WEBHOOK;
  metadata: {
    webhookId: string;
    environment: string;
    secretPath: string;
    webhookUrl: string;
    isDisabled: boolean;
  };
}

interface GetSecretImportsEvent {
  type: EventType.GET_SECRET_IMPORTS;
  metadata: {
    environment: string;
    folderId: string;
    numberOfImports: number;
  };
}

interface CreateSecretImportEvent {
  type: EventType.CREATE_SECRET_IMPORT;
  metadata: {
    secretImportId: string;
    folderId: string;
    importFromEnvironment: string;
    importFromSecretPath: string;
    importToEnvironment: string;
    importToSecretPath: string;
  };
}

interface UpdateSecretImportEvent {
  type: EventType.UPDATE_SECRET_IMPORT;
  metadata: {
    secretImportId: string;
    folderId: string;
    importToEnvironment: string;
    importToSecretPath: string;
    position: number;
    orderBefore?: {
      environment: string;
      secretPath: string;
    }[];
    orderAfter?: {
      environment: string;
      secretPath: string;
    }[];
  };
}

interface DeleteSecretImportEvent {
  type: EventType.DELETE_SECRET_IMPORT;
  metadata: {
    secretImportId: string;
    folderId: string;
    importFromEnvironment: string;
    importFromSecretPath: string;
    importToEnvironment: string;
    importToSecretPath: string;
  };
}

interface UpdateUserRole {
  type: EventType.UPDATE_USER_WORKSPACE_ROLE;
  metadata: {
    userId: string;
    email: string;
    oldRole: string;
    newRole: string;
  };
}

interface UpdateUserDeniedPermissions {
  type: EventType.UPDATE_USER_WORKSPACE_DENIED_PERMISSIONS;
  metadata: {
    userId: string;
    email: string;
    deniedPermissions: {
      environmentSlug: string;
      ability: string;
    }[];
  };
}
interface SecretApprovalMerge {
  type: EventType.SECRET_APPROVAL_MERGED;
  metadata: {
    mergedBy: string;
    secretApprovalRequestSlug: string;
    secretApprovalRequestId: string;
  };
}

interface SecretApprovalClosed {
  type: EventType.SECRET_APPROVAL_CLOSED;
  metadata: {
    closedBy: string;
    secretApprovalRequestSlug: string;
    secretApprovalRequestId: string;
  };
}

interface SecretApprovalReopened {
  type: EventType.SECRET_APPROVAL_REOPENED;
  metadata: {
    reopenedBy: string;
    secretApprovalRequestSlug: string;
    secretApprovalRequestId: string;
  };
}

interface SecretApprovalRequest {
  type: EventType.SECRET_APPROVAL_REQUEST;
  metadata: {
    committedBy: string;
    secretApprovalRequestSlug: string;
    secretApprovalRequestId: string;
  };
}

export type Event =
  | GetSecretsEvent
  | GetSecretEvent
  | CreateSecretEvent
  | CreateSecretBatchEvent
  | UpdateSecretEvent
  | UpdateSecretBatchEvent
  | DeleteSecretEvent
  | DeleteSecretBatchEvent
  | GetWorkspaceKeyEvent
  | AuthorizeIntegrationEvent
  | UnauthorizeIntegrationEvent
  | CreateIntegrationEvent
  | DeleteIntegrationEvent
  | AddTrustedIPEvent
  | UpdateTrustedIPEvent
  | DeleteTrustedIPEvent
  | CreateServiceTokenEvent
  | DeleteServiceTokenEvent
  | CreateIdentityEvent
  | UpdateIdentityEvent
  | DeleteIdentityEvent
  | LoginIdentityUniversalAuthEvent
  | AddIdentityUniversalAuthEvent
  | UpdateIdentityUniversalAuthEvent
  | GetIdentityUniversalAuthEvent
  | CreateIdentityUniversalAuthClientSecretEvent
  | GetIdentityUniversalAuthClientSecretsEvent
  | RevokeIdentityUniversalAuthClientSecretEvent
  | CreateEnvironmentEvent
  | UpdateEnvironmentEvent
  | DeleteEnvironmentEvent
  | AddWorkspaceMemberEvent
  | AddBatchWorkspaceMemberEvent
  | RemoveWorkspaceMemberEvent
  | CreateFolderEvent
  | UpdateFolderEvent
  | DeleteFolderEvent
  | CreateWebhookEvent
  | UpdateWebhookStatusEvent
  | DeleteWebhookEvent
  | GetSecretImportsEvent
  | CreateSecretImportEvent
  | UpdateSecretImportEvent
  | DeleteSecretImportEvent
  | UpdateUserRole
  | UpdateUserDeniedPermissions
  | SecretApprovalMerge
  | SecretApprovalClosed
  | SecretApprovalRequest;

const kdb = new Level<string, any>("./db", { valueEncoding: "json" });

const projectKv = kdb.sublevel(TableName.Project);
const secKv = kdb.sublevel(TableName.Secret);
const userKv = kdb.sublevel(TableName.Users);
const orgKv = kdb.sublevel(TableName.Organization);
const identityKv = kdb.sublevel(TableName.Identity);
const secretApprovalRequestKv = kdb.sublevel(TableName.SecretApprovalRequest);
const projectMembKv = kdb.sublevel(TableName.ProjectMembership);
const projectKeyKv = kdb.sublevel(TableName.ProjectKeys);
const integrationKv = kdb.sublevel(TableName.Integration);
const trustedIpKv = kdb.sublevel(TableName.TrustedIps);
const identityUaKv = kdb.sublevel(TableName.IdentityUniversalAuth);
const identityUaClientSecKv = kdb.sublevel(TableName.IdentityUaClientSecret);
const identityAccessTokenKv = kdb.sublevel(TableName.IdentityAccessToken);
const webhookKv = kdb.sublevel(TableName.Webhook);

// add these to the main migrator
// this will be empty
const secretImportKv = kdb.sublevel(TableName.SecretImport);

const getKeyWithFallack = (sublevel: typeof projectKeyKv, key: string) =>
  sublevel.get(key).catch(() => key);

const main = async () => {
  try {
    dotenv.config();
    const prompt = PromptSync({ sigint: true });

    let mongodb_url = process.env.MONGO_DB_URL;
    if (!mongodb_url) {
      mongodb_url = prompt("Type the mongodb url: ");
    }
    console.log("Checking mongoose connection...");
    await mongoose.connect(mongodb_url);
    console.log("Connected successfully to mongo");

    let postgres_url = process.env.POSTGRES_DB_URL;
    if (!postgres_url) {
      postgres_url = prompt("Type the postgres url: ");
    }
    console.log("Checking postgres connection...");
    const db = knex({
      client: "pg",
      connection: postgres_url,
      migrations: {
        directory: path.join(__dirname, "../../backend-pg/src/db/migrations"),
        extension: "ts",
        tableName: "infisical_migrations",
      },
    });
    console.log("Connected successfully to postgres");
    await db.raw("select 1+1 as result");

    if (process.env.START_FRESH === "true") {
      console.log("Starting rolling back to latest, comment this out later");
      await db.migrate.rollback({}, true);
      await kdb.clear();
      console.log("Rolling back completed");

      console.log("Executing migration");
      await db.migrate.latest();
      console.log("Completed migration");
    }

    await migrateCollection({
      db,
      mongooseCollection: AuditLog,
      postgresTableName: TableName.AuditLog,
      returnKeys: ["id"],
      preProcessing: async (doc) => {
        const id = uuidV4();
        const orgId = await orgKv
          .get(doc.organization.toString())
          .catch(() => null);
        if (!orgId) return;

        const projectId = await projectKv
          .get(doc.workspace.toString())
          .catch(() => null);
        if (!projectId) return;

        const eventFields = {
          id,
          actor: doc.actor.type,
          actorMetadata: doc.actor.metadata,
          orgId,
          eventType: doc.event.type,
          expiresAt: doc.expiresAt,
          ipAddress: doc.ipAddress,
          projectId,
          userAgent: doc.userAgent,
          userAgentType: doc.userAgentType,
          createdAt: (doc as any).createdAt,
          updatedAt: (doc as any).updatedAt,
        };

        switch (doc.event.type) {
          case EventType.GET_SECRET: {
            const event = doc.event.metadata;
            if (!event.environment) return;

            const secretId = await secKv.get(event.secretId).catch(() => null);
            if (!secretId) return;
            const pgEvent = { ...event, secretId };
            return { ...eventFields, eventMetadata: pgEvent };
          }
          case EventType.GET_SECRETS: {
            const event = doc.event.metadata;
            return { ...eventFields, eventMetadata: event };
          }
          case EventType.CREATE_SECRET: {
            const event = doc.event.metadata;
            const secretId = await secKv.get(event.secretId).catch(() => null);
            if (!secretId) return;
            const pgEvent = { ...event, secretId };
            return { ...eventFields, eventMetadata: pgEvent };
          }
          case EventType.CREATE_SECRETS: {
            const event = doc.event.metadata;
            const secrets = await Promise.all(
              event.secrets.flatMap(async (el) => {
                const secretId = await secKv.get(el.secretId).catch(() => null);
                if (!secretId) return [];
                return { ...el, secretId };
              }),
            );
            return { ...eventFields, eventMetadata: { ...event, secrets } };
          }
          case EventType.UPDATE_SECRET: {
            const event = doc.event.metadata;
            const secretId = await secKv.get(event.secretId).catch(() => null);
            if (!secretId) return;
            const pgEvent = { ...event, secretId };
            return { ...eventFields, eventMetadata: pgEvent };
          }
          case EventType.UPDATE_SECRETS: {
            const event = doc.event.metadata;
            const secrets = await Promise.all(
              event.secrets.flatMap(async (el) => {
                const secretId = await secKv.get(el.secretId).catch(() => null);
                if (!secretId) return [];
                return { ...el, secretId };
              }),
            );
            return { ...eventFields, eventMetadata: { ...event, secrets } };
          }
          case EventType.DELETE_SECRET: {
            const event = doc.event.metadata;
            const secretId = await secKv.get(event.secretId).catch(() => null);
            if (!secretId) return;
            const pgEvent = { ...event, secretId };
            return { ...eventFields, eventMetadata: pgEvent };
          }
          case EventType.DELETE_SECRETS: {
            const event = doc.event.metadata;
            const secrets = await Promise.all(
              event.secrets.flatMap(async (el) => {
                const secretId = await secKv.get(el.secretId).catch(() => null);
                if (!secretId) return [];
                return { ...el, secretId };
              }),
            );
            return { ...eventFields, eventMetadata: { ...event, secrets } };
          }
          case EventType.GET_WORKSPACE_KEY: {
            const event = doc.event.metadata;
            const keyId = await projectKeyKv.get(event.keyId).catch(() => null);
            if (!keyId) return;
            return { ...eventFields, eventMetadata: { keyId } };
          }
          case EventType.AUTHORIZE_INTEGRATION: {
            const event = doc.event.metadata;
            return { ...eventFields, eventMetadata: event };
          }
          case EventType.UNAUTHORIZE_INTEGRATION: {
            const event = doc.event.metadata;
            return { ...eventFields, eventMetadata: event };
          }
          case EventType.CREATE_INTEGRATION: {
            const event = doc.event.metadata;
            const integrationId = await integrationKv
              .get(event.integrationId)
              .catch(() => event.integrationId);
            return {
              ...eventFields,
              eventMetadata: { ...event, integrationId },
            };
          }
          case EventType.DELETE_INTEGRATION: {
            const event = doc.event.metadata;
            const integrationId = await integrationKv
              .get(event.integrationId)
              .catch(() => event.integrationId);
            return {
              ...eventFields,
              eventMetadata: { ...event, integrationId },
            };
          }
          case EventType.ADD_TRUSTED_IP: {
            const event = doc.event.metadata;
            const trustedIpId = await trustedIpKv
              .get(event.trustedIpId)
              .catch(() => event.trustedIpId);
            return {
              ...eventFields,
              eventMetadata: { ...event, trustedIpId },
            };
          }
          case EventType.UPDATE_TRUSTED_IP: {
            const event = doc.event.metadata;
            const trustedIpId = await trustedIpKv
              .get(event.trustedIpId)
              .catch(() => event.trustedIpId);
            return {
              ...eventFields,
              eventMetadata: { ...event, trustedIpId },
            };
          }
          case EventType.DELETE_TRUSTED_IP: {
            const event = doc.event.metadata;
            const trustedIpId = await trustedIpKv
              .get(event.trustedIpId)
              .catch(() => event.trustedIpId);
            if (!trustedIpId) return;
            return {
              ...eventFields,
              eventMetadata: { ...event, trustedIpId },
            };
          }
          case EventType.CREATE_SERVICE_TOKEN: {
            const event = doc.event.metadata;
            return {
              ...eventFields,
              eventMetadata: event,
            };
          }
          case EventType.DELETE_SERVICE_TOKEN: {
            const event = doc.event.metadata;
            return {
              ...eventFields,
              eventMetadata: event,
            };
          }
          case EventType.CREATE_IDENTITY: {
            const event = doc.event.metadata;
            const trustedIpId = await identityKv
              .get(event.identityId)
              .catch(() => event.identityId);
            return {
              ...eventFields,
              eventMetadata: { ...event, trustedIpId },
            };
          }
          case EventType.UPDATE_IDENTITY: {
            const event = doc.event.metadata;
            const trustedIpId = await identityKv
              .get(event.identityId)
              .catch(() => event.identityId);
            return {
              ...eventFields,
              eventMetadata: { ...event, trustedIpId },
            };
          }
          case EventType.DELETE_IDENTITY: {
            const event = doc.event.metadata;
            const trustedIpId = await identityKv
              .get(event.identityId)
              .catch(() => event.identityId);
            return {
              ...eventFields,
              eventMetadata: { ...event, trustedIpId },
            };
          }
          case EventType.LOGIN_IDENTITY_UNIVERSAL_AUTH: {
            const event = doc.event.metadata;
            const identityId = await getKeyWithFallack(
              identityKv,
              event.identityId,
            );
            const identityAccessTokenId = await getKeyWithFallack(
              identityAccessTokenKv,
              event.identityAccessTokenId,
            );
            const identityUniversalAuthId = await getKeyWithFallack(
              identityUaKv,
              event.identityUniversalAuthId,
            );
            const clientSecretId = await getKeyWithFallack(
              identityUaClientSecKv,
              event.clientSecretId,
            );
            return {
              ...eventFields,
              eventMetadata: {
                identityId,
                identityAccessTokenId,
                identityUniversalAuthId,
                clientSecretId,
              },
            };
          }
          case EventType.ADD_IDENTITY_UNIVERSAL_AUTH: {
            const event = doc.event.metadata;
            const identityId = await getKeyWithFallack(
              identityKv,
              event.identityId,
            );
            return {
              ...eventFields,
              eventMetadata: {
                ...event,
                identityId,
              },
            };
          }
          case EventType.UPDATE_IDENTITY_UNIVERSAL_AUTH: {
            const event = doc.event.metadata;
            const identityId = await getKeyWithFallack(
              identityKv,
              event.identityId,
            );
            return {
              ...eventFields,
              eventMetadata: {
                ...event,
                identityId,
              },
            };
          }
          case EventType.GET_IDENTITY_UNIVERSAL_AUTH: {
            const event = doc.event.metadata;
            const identityId = await getKeyWithFallack(
              identityKv,
              event.identityId,
            );
            return {
              ...eventFields,
              eventMetadata: {
                identityId,
              },
            };
          }
          case EventType.CREATE_ENVIRONMENT: {
            const event = doc.event.metadata;
            return {
              ...eventFields,
              eventMetadata: event,
            };
          }
          case EventType.UPDATE_ENVIRONMENT: {
            const event = doc.event.metadata;
            return {
              ...eventFields,
              eventMetadata: event,
            };
          }
          case EventType.DELETE_ENVIRONMENT: {
            const event = doc.event.metadata;
            return {
              ...eventFields,
              eventMetadata: event,
            };
          }
          case EventType.ADD_WORKSPACE_MEMBER: {
            const event = doc.event.metadata;
            const userId = await getKeyWithFallack(userKv, event.userId);
            return { ...eventFields, eventMetadata: { ...event, userId } };
          }
          case EventType.ADD_BATCH_WORKSPACE_MEMBER: {
            const event = doc.event.metadata;
            const pgEvent = await Promise.all(
              event.flatMap(async ({ userId, email }) => ({
                userId: await getKeyWithFallack(userKv, userId),
                email,
              })),
            );
            return { ...eventFields, eventMetadata: pgEvent };
          }
          case EventType.REMOVE_WORKSPACE_MEMBER: {
            const event = doc.event.metadata;
            const userId = await getKeyWithFallack(userKv, event.userId);
            return { ...eventFields, eventMetadata: { ...event, userId } };
          }
          case EventType.CREATE_FOLDER: {
            const event = doc.event.metadata;
            const folderKv = getFolderKv(
              doc.workspace.toString(),
              truncateAndSlugify(event.environment),
            );
            const folderId = await getKeyWithFallack(
              folderKv as any,
              event.folderId,
            );
            return { ...eventFields, eventMetadata: { ...event, folderId } };
          }
          case EventType.UPDATE_FOLDER: {
            const event = doc.event.metadata;
            const folderKv = getFolderKv(
              doc.workspace.toString(),
              truncateAndSlugify(event.environment),
            );
            const folderId = await getKeyWithFallack(
              folderKv as any,
              event.folderId,
            );
            return { ...eventFields, eventMetadata: { ...event, folderId } };
          }
          case EventType.DELETE_FOLDER: {
            const event = doc.event.metadata;
            const folderKv = getFolderKv(
              doc.workspace.toString(),
              truncateAndSlugify(event.environment),
            );
            const folderId = await getKeyWithFallack(
              folderKv as any,
              event.folderId,
            );
            return { ...eventFields, eventMetadata: { ...event, folderId } };
          }
          case EventType.CREATE_WEBHOOK: {
            const event = doc.event.metadata;
            const webhookId = await getKeyWithFallack(
              webhookKv,
              event.webhookId,
            );
            return { ...eventFields, eventMetadata: { ...event, webhookId } };
          }
          case EventType.UPDATE_WEBHOOK_STATUS: {
            const event = doc.event.metadata;
            const webhookId = await getKeyWithFallack(
              webhookKv,
              event.webhookId,
            );
            return { ...eventFields, eventMetadata: { ...event, webhookId } };
          }
          case EventType.DELETE_WEBHOOK: {
            const event = doc.event.metadata;
            const webhookId = await getKeyWithFallack(
              webhookKv,
              event.webhookId,
            );
            return { ...eventFields, eventMetadata: { ...event, webhookId } };
          }
          case EventType.CREATE_SECRET_IMPORT: {
            const event = doc.event.metadata;
            const folderKv = getFolderKv(
              doc.workspace.toString(),
              truncateAndSlugify(event.importToEnvironment),
            );
            const folderId = await getKeyWithFallack(
              folderKv as any,
              event.folderId,
            );
            const secretImportId = await getKeyWithFallack(
              secretImportKv,
              event.secretImportId,
            );
            return {
              ...eventFields,
              eventMetadata: { ...event, folderId, secretImportId },
            };
          }
          case EventType.UPDATE_SECRET_IMPORT: {
            const event = doc.event.metadata;
            const folderKv = getFolderKv(
              doc.workspace.toString(),
              truncateAndSlugify(event.importToEnvironment),
            );
            const folderId = await getKeyWithFallack(
              folderKv as any,
              event.folderId,
            );
            const secretImportId = await getKeyWithFallack(
              secretImportKv,
              event.secretImportId,
            );
            return {
              ...eventFields,
              eventMetadata: { ...event, folderId, secretImportId },
            };
          }
          case EventType.DELETE_SECRET_IMPORT: {
            const event = doc.event.metadata;
            const folderKv = getFolderKv(
              doc.workspace.toString(),
              truncateAndSlugify(event.importToEnvironment),
            );
            const folderId = await getKeyWithFallack(
              folderKv as any,
              event.folderId,
            );
            const secretImportId = await getKeyWithFallack(
              secretImportKv,
              event.secretImportId,
            );
            return {
              ...eventFields,
              eventMetadata: { ...event, folderId, secretImportId },
            };
          }
          case EventType.UPDATE_USER_WORKSPACE_ROLE: {
            const event = doc.event.metadata;
            const userId = await getKeyWithFallack(userKv, event.userId);
            return {
              ...eventFields,
              eventMetadata: { ...event, userId },
            };
          }
          case EventType.UPDATE_USER_WORKSPACE_DENIED_PERMISSIONS: {
            const event = doc.event.metadata;
            const userId = await getKeyWithFallack(userKv, event.userId);
            return {
              ...eventFields,
              eventMetadata: { ...event, userId },
            };
          }
          case EventType.SECRET_APPROVAL_MERGED: {
            const event = doc.event.metadata;
            const secretApprovalRequestId = await getKeyWithFallack(
              secretApprovalRequestKv,
              event.secretApprovalRequestId,
            );
            const mergedBy = await getKeyWithFallack(
              projectMembKv,
              event.mergedBy,
            );
            return {
              ...eventFields,
              eventMetadata: { ...event, secretApprovalRequestId, mergedBy },
            };
          }
          case EventType.SECRET_APPROVAL_REQUEST: {
            const event = doc.event.metadata;
            const secretApprovalRequestId = await getKeyWithFallack(
              secretApprovalRequestKv,
              event.secretApprovalRequestId,
            );
            const committedBy = await getKeyWithFallack(
              projectMembKv,
              event.committedBy,
            );
            return {
              ...eventFields,
              eventMetadata: { ...event, secretApprovalRequestId, committedBy },
            };
          }
          case EventType.SECRET_APPROVAL_CLOSED: {
            const event = doc.event.metadata;
            const secretApprovalRequestId = await getKeyWithFallack(
              secretApprovalRequestKv,
              event.secretApprovalRequestId,
            );
            const closedBy = await getKeyWithFallack(
              projectMembKv,
              event.closedBy,
            );
            return {
              ...eventFields,
              eventMetadata: { ...event, secretApprovalRequestId, closedBy },
            };
          }
          case EventType.SECRET_APPROVAL_REOPENED: {
            const event = doc.event.metadata;
            const secretApprovalRequestId = await getKeyWithFallack(
              secretApprovalRequestKv,
              event.secretApprovalRequestId,
            );
            const reopenedBy = await getKeyWithFallack(
              projectMembKv,
              event.reopenedBy,
            );
            return {
              ...eventFields,
              eventMetadata: { ...event, secretApprovalRequestId, reopenedBy },
            };
          }
          default: {
            throw new Error("Unknown field");
          }
        }
      },
    });
  } catch (error) {
    console.error(error);
  }
  process.exit(0);
};

main();
