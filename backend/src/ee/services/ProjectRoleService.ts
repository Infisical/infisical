import { Types } from "mongoose";
import {
  AbilityBuilder,
  ForcedSubject,
  MongoAbility,
  RawRuleOf,
  buildMongoQueryMatcher,
  createMongoAbility
} from "@casl/ability";
import { UnauthorizedRequestError } from "../../utils/errors";
import { FieldCondition, FieldInstruction, JsInterpreter } from "@ucast/mongo2js";
import picomatch from "picomatch";
import { AuthData } from "../../interfaces/middleware";
import { ActorType, IRole } from "../models";
import { Membership, ServiceTokenData, ServiceTokenDataV3 } from "../../models";
import { ADMIN, CUSTOM, MEMBER, VIEWER } from "../../variables";
import { checkIPAgainstBlocklist } from "../../utils/ip";

const $glob: FieldInstruction<string> = {
  type: "field",
  validate(instruction, value) {
    if (typeof value !== "string") {
      throw new Error(`"${instruction.name}" expects value to be a string`);
    }
  }
};

const glob: JsInterpreter<FieldCondition<string>> = (node, object, context) => {
  const secretPath = context.get(object, node.field);
  const permissionSecretGlobPath = node.value;
  return picomatch.isMatch(secretPath, permissionSecretGlobPath, { strictSlashes: false });
};

export const conditionsMatcher = buildMongoQueryMatcher({ $glob }, { glob });

export enum ProjectPermissionActions {
  Read = "read",
  Create = "create",
  Edit = "edit",
  Delete = "delete"
}

export enum ProjectPermissionSub {
  Role = "role",
  Member = "member",
  Settings = "settings",
  Integrations = "integrations",
  Webhooks = "webhooks",
  ServiceTokens = "service-tokens",
  Environments = "environments",
  Tags = "tags",
  AuditLogs = "audit-logs",
  IpAllowList = "ip-allowlist",
  Workspace = "workspace",
  Secrets = "secrets",
  SecretRollback = "secret-rollback",
  SecretApproval = "secret-approval",
  SecretRotation = "secret-rotation"
}

type SubjectFields = {
  environment: string;
  secretPath: string;
};

export type ProjectPermissionSet =
  | [
      ProjectPermissionActions,
      ProjectPermissionSub.Secrets | (ForcedSubject<ProjectPermissionSub.Secrets> & SubjectFields)
    ]
  | [ProjectPermissionActions, ProjectPermissionSub.Role]
  | [ProjectPermissionActions, ProjectPermissionSub.Tags]
  | [ProjectPermissionActions, ProjectPermissionSub.Member]
  | [ProjectPermissionActions, ProjectPermissionSub.Integrations]
  | [ProjectPermissionActions, ProjectPermissionSub.Webhooks]
  | [ProjectPermissionActions, ProjectPermissionSub.AuditLogs]
  | [ProjectPermissionActions, ProjectPermissionSub.Environments]
  | [ProjectPermissionActions, ProjectPermissionSub.IpAllowList]
  | [ProjectPermissionActions, ProjectPermissionSub.Settings]
  | [ProjectPermissionActions, ProjectPermissionSub.ServiceTokens]
  | [ProjectPermissionActions, ProjectPermissionSub.SecretApproval]
  | [ProjectPermissionActions, ProjectPermissionSub.SecretRotation]
  | [ProjectPermissionActions.Delete, ProjectPermissionSub.Workspace]
  | [ProjectPermissionActions.Edit, ProjectPermissionSub.Workspace]
  | [ProjectPermissionActions.Read, ProjectPermissionSub.SecretRollback]
  | [ProjectPermissionActions.Create, ProjectPermissionSub.SecretRollback];

const buildAdminPermission = () => {
  const { can, build } = new AbilityBuilder<MongoAbility<ProjectPermissionSet>>(createMongoAbility);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.Secrets);
  can(ProjectPermissionActions.Create, ProjectPermissionSub.Secrets);
  can(ProjectPermissionActions.Edit, ProjectPermissionSub.Secrets);
  can(ProjectPermissionActions.Delete, ProjectPermissionSub.Secrets);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.SecretApproval);
  can(ProjectPermissionActions.Create, ProjectPermissionSub.SecretApproval);
  can(ProjectPermissionActions.Edit, ProjectPermissionSub.SecretApproval);
  can(ProjectPermissionActions.Delete, ProjectPermissionSub.SecretApproval);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.SecretRotation);
  can(ProjectPermissionActions.Create, ProjectPermissionSub.SecretRotation);
  can(ProjectPermissionActions.Edit, ProjectPermissionSub.SecretRotation);
  can(ProjectPermissionActions.Delete, ProjectPermissionSub.SecretRotation);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.SecretRollback);
  can(ProjectPermissionActions.Create, ProjectPermissionSub.SecretRollback);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.Member);
  can(ProjectPermissionActions.Create, ProjectPermissionSub.Member);
  can(ProjectPermissionActions.Edit, ProjectPermissionSub.Member);
  can(ProjectPermissionActions.Delete, ProjectPermissionSub.Member);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.Role);
  can(ProjectPermissionActions.Create, ProjectPermissionSub.Role);
  can(ProjectPermissionActions.Edit, ProjectPermissionSub.Role);
  can(ProjectPermissionActions.Delete, ProjectPermissionSub.Role);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.Integrations);
  can(ProjectPermissionActions.Create, ProjectPermissionSub.Integrations);
  can(ProjectPermissionActions.Edit, ProjectPermissionSub.Integrations);
  can(ProjectPermissionActions.Delete, ProjectPermissionSub.Integrations);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.Webhooks);
  can(ProjectPermissionActions.Create, ProjectPermissionSub.Webhooks);
  can(ProjectPermissionActions.Edit, ProjectPermissionSub.Webhooks);
  can(ProjectPermissionActions.Delete, ProjectPermissionSub.Webhooks);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.ServiceTokens);
  can(ProjectPermissionActions.Create, ProjectPermissionSub.ServiceTokens);
  can(ProjectPermissionActions.Edit, ProjectPermissionSub.ServiceTokens);
  can(ProjectPermissionActions.Delete, ProjectPermissionSub.ServiceTokens);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.Settings);
  can(ProjectPermissionActions.Create, ProjectPermissionSub.Settings);
  can(ProjectPermissionActions.Edit, ProjectPermissionSub.Settings);
  can(ProjectPermissionActions.Delete, ProjectPermissionSub.Settings);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.Environments);
  can(ProjectPermissionActions.Create, ProjectPermissionSub.Environments);
  can(ProjectPermissionActions.Edit, ProjectPermissionSub.Environments);
  can(ProjectPermissionActions.Delete, ProjectPermissionSub.Environments);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.Tags);
  can(ProjectPermissionActions.Create, ProjectPermissionSub.Tags);
  can(ProjectPermissionActions.Edit, ProjectPermissionSub.Tags);
  can(ProjectPermissionActions.Delete, ProjectPermissionSub.Tags);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.AuditLogs);
  can(ProjectPermissionActions.Create, ProjectPermissionSub.AuditLogs);
  can(ProjectPermissionActions.Edit, ProjectPermissionSub.AuditLogs);
  can(ProjectPermissionActions.Delete, ProjectPermissionSub.AuditLogs);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.IpAllowList);
  can(ProjectPermissionActions.Create, ProjectPermissionSub.IpAllowList);
  can(ProjectPermissionActions.Edit, ProjectPermissionSub.IpAllowList);
  can(ProjectPermissionActions.Delete, ProjectPermissionSub.IpAllowList);

  can(ProjectPermissionActions.Edit, ProjectPermissionSub.Workspace);
  can(ProjectPermissionActions.Delete, ProjectPermissionSub.Workspace);

  return build({ conditionsMatcher });
};

export const adminProjectPermissions = buildAdminPermission();

const buildMemberPermission = () => {
  const { can, build } = new AbilityBuilder<MongoAbility<ProjectPermissionSet>>(createMongoAbility);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.Secrets);
  can(ProjectPermissionActions.Create, ProjectPermissionSub.Secrets);
  can(ProjectPermissionActions.Edit, ProjectPermissionSub.Secrets);
  can(ProjectPermissionActions.Delete, ProjectPermissionSub.Secrets);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.SecretApproval);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.SecretRotation);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.SecretRollback);
  can(ProjectPermissionActions.Create, ProjectPermissionSub.SecretRollback);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.Member);
  can(ProjectPermissionActions.Create, ProjectPermissionSub.Member);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.Integrations);
  can(ProjectPermissionActions.Create, ProjectPermissionSub.Integrations);
  can(ProjectPermissionActions.Edit, ProjectPermissionSub.Integrations);
  can(ProjectPermissionActions.Delete, ProjectPermissionSub.Integrations);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.Webhooks);
  can(ProjectPermissionActions.Create, ProjectPermissionSub.Webhooks);
  can(ProjectPermissionActions.Edit, ProjectPermissionSub.Webhooks);
  can(ProjectPermissionActions.Delete, ProjectPermissionSub.Webhooks);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.ServiceTokens);
  can(ProjectPermissionActions.Create, ProjectPermissionSub.ServiceTokens);
  can(ProjectPermissionActions.Edit, ProjectPermissionSub.ServiceTokens);
  can(ProjectPermissionActions.Delete, ProjectPermissionSub.ServiceTokens);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.Settings);
  can(ProjectPermissionActions.Create, ProjectPermissionSub.Settings);
  can(ProjectPermissionActions.Edit, ProjectPermissionSub.Settings);
  can(ProjectPermissionActions.Delete, ProjectPermissionSub.Settings);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.Environments);
  can(ProjectPermissionActions.Create, ProjectPermissionSub.Environments);
  can(ProjectPermissionActions.Edit, ProjectPermissionSub.Environments);
  can(ProjectPermissionActions.Delete, ProjectPermissionSub.Environments);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.Tags);
  can(ProjectPermissionActions.Create, ProjectPermissionSub.Tags);
  can(ProjectPermissionActions.Edit, ProjectPermissionSub.Tags);
  can(ProjectPermissionActions.Delete, ProjectPermissionSub.Tags);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.Role);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.AuditLogs);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.IpAllowList);

  return build({ conditionsMatcher });
};

export const memberProjectPermissions = buildMemberPermission();

const buildViewerPermission = () => {
  const { can, build } = new AbilityBuilder<MongoAbility<ProjectPermissionSet>>(createMongoAbility);

  can(ProjectPermissionActions.Read, ProjectPermissionSub.Secrets);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.SecretApproval);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.SecretRollback);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.SecretRotation);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.Member);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.Role);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.Integrations);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.Webhooks);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.ServiceTokens);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.Settings);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.Environments);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.Tags);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.AuditLogs);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.IpAllowList);

  return build({ conditionsMatcher });
};

export const viewerProjectPermission = buildViewerPermission();

/**
 * Return permissions for user/service pertaining to workspace with id [workspaceId]
 * 
 * Note: should not rely on this function for ST V2 authorization logic
 * b/c ST V2 does not support role-based access control
 */
export const getAuthDataProjectPermissions = async ({
  authData,
  workspaceId
}: {
  authData: AuthData;
  workspaceId: Types.ObjectId;
}) => {
  let role: "admin" | "member" | "viewer" | "custom";
  let customRole;
  
  switch (authData.actor.type) {
    case ActorType.USER: {
      const membership = await Membership.findOne({
        user: authData.authPayload._id,
        workspace: workspaceId
      })
        .populate<{
          customRole: IRole & { permissions: RawRuleOf<MongoAbility<ProjectPermissionSet>>[] };
        }>("customRole")
        .exec();
    
      if (!membership || (membership.role === "custom" && !membership.customRole)) {
        throw UnauthorizedRequestError();
      }
      
      role = membership.role;
      customRole = membership.customRole;
      break;
    }
    case ActorType.SERVICE: {
      const serviceTokenData = await ServiceTokenData.findById(authData.authPayload._id);
      if (!serviceTokenData || !serviceTokenData.workspace.equals(workspaceId)) throw UnauthorizedRequestError();
      role = "viewer";
      break;
    }
    case ActorType.SERVICE_V3: {
      const serviceTokenData = await ServiceTokenDataV3
        .findById(authData.authPayload._id)
        .populate<{
          customRole: IRole & { permissions: RawRuleOf<MongoAbility<ProjectPermissionSet>>[] };
        }>("customRole")
        .exec();
        
      if (!serviceTokenData || (serviceTokenData.role === "custom" && !serviceTokenData.customRole)) {
        throw UnauthorizedRequestError();
      }

      checkIPAgainstBlocklist({
        ipAddress: authData.ipAddress,
        trustedIps: serviceTokenData.trustedIps
      });
    
      role = serviceTokenData.role;
      customRole = serviceTokenData.customRole;
      break;
    }
    default:
      throw UnauthorizedRequestError();
  }

  switch (role) {
    case ADMIN:
      return { permission: adminProjectPermissions };
    case MEMBER:
      return { permission: memberProjectPermissions };
    case VIEWER:
      return { permission: viewerProjectPermission };
    case CUSTOM: {
      if (!customRole) throw UnauthorizedRequestError();
      return { 
        permission: createMongoAbility<ProjectPermissionSet>(
          customRole.permissions, 
          { conditionsMatcher }
        )
      };
    }
    default:
      throw UnauthorizedRequestError();
  }
}
