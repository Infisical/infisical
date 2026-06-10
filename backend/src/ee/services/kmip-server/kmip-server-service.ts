import { ForbiddenError } from "@casl/ability";

import { OrganizationActionScope } from "@app/db/schemas";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, DatabaseError, NotFoundError } from "@app/lib/errors";
import { ActorAuthMethod, ActorType } from "@app/services/auth/auth-type";

import { OrgPermissionKmipServerActions, OrgPermissionSubjects } from "../permission/org-permission";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { TResourceAuthMethodServiceFactory } from "../resource-auth-method/resource-auth-method-service";
import { TKmipServerDALFactory } from "./kmip-server-dal";

export type TKmipServerServiceFactory = ReturnType<typeof kmipServerServiceFactory>;

type TActor = {
  type: ActorType;
  id: string;
  orgId: string;
  authMethod: ActorAuthMethod;
};

export const kmipServerServiceFactory = ({
  kmipServerDAL,
  permissionService,
  resourceAuthMethodService
}: {
  kmipServerDAL: TKmipServerDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  resourceAuthMethodService: Pick<TResourceAuthMethodServiceFactory, "initAtCreate">;
}) => {
  const $checkPermission = async (actor: TActor, action: OrgPermissionKmipServerActions) => {
    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor: actor.type,
      actorId: actor.id,
      orgId: actor.orgId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId
    });
    ForbiddenError.from(permission).throwUnlessCan(action, OrgPermissionSubjects.KmipServer);
  };

  const createKmipServer = async ({
    name,
    hostnamesOrIps,
    ttl,
    keyAlgorithm,
    authMethod,
    actor
  }: {
    name: string;
    hostnamesOrIps: string;
    ttl?: string;
    keyAlgorithm?: string;
    authMethod:
      | { method: "aws"; config: { stsEndpoint: string; allowedPrincipalArns: string; allowedAccountIds: string } }
      | { method: "token" };
    actor: TActor;
  }) => {
    await $checkPermission(actor, OrgPermissionKmipServerActions.CreateKmipServers);

    try {
      return await kmipServerDAL.transaction(async (tx) => {
        const created = await kmipServerDAL.create({ name, orgId: actor.orgId, hostnamesOrIps, ttl, keyAlgorithm }, tx);
        await resourceAuthMethodService.initAtCreate({ resource: { type: "kmip", id: created.id }, authMethod }, tx);
        return created;
      });
    } catch (err) {
      if (err instanceof DatabaseError && (err.error as { code: string })?.code === DatabaseErrorCode.UniqueViolation) {
        throw new BadRequestError({ message: `A KMIP server named "${name}" already exists` });
      }
      throw err;
    }
  };

  const updateKmipServer = async ({
    kmipServerId,
    actor,
    ...fields
  }: {
    kmipServerId: string;
    hostnamesOrIps?: string;
    ttl?: string;
    keyAlgorithm?: string;
    actor: TActor;
  }) => {
    await $checkPermission(actor, OrgPermissionKmipServerActions.EditKmipServers);

    const kmipServer = await kmipServerDAL.findOne({ id: kmipServerId, orgId: actor.orgId });
    if (!kmipServer) {
      throw new NotFoundError({ message: `KMIP server ${kmipServerId} not found` });
    }

    const definedFields = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
    return kmipServerDAL.updateById(kmipServerId, definedFields);
  };

  const getOrgKmipServer = async ({ kmipServerId, orgId }: { kmipServerId: string; orgId: string }) => {
    const kmipServer = await kmipServerDAL.findOne({ id: kmipServerId, orgId });
    if (!kmipServer) {
      throw new NotFoundError({ message: `KMIP server ${kmipServerId} not found` });
    }
    return kmipServer;
  };

  const listKmipServers = async ({ actor }: { actor: TActor }) => {
    await $checkPermission(actor, OrgPermissionKmipServerActions.ListKmipServers);
    return kmipServerDAL.find({ orgId: actor.orgId });
  };

  const deleteKmipServer = async ({ kmipServerId, actor }: { kmipServerId: string; actor: TActor }) => {
    await $checkPermission(actor, OrgPermissionKmipServerActions.DeleteKmipServers);

    const kmipServer = await kmipServerDAL.findOne({ id: kmipServerId, orgId: actor.orgId });
    if (!kmipServer) {
      throw new NotFoundError({ message: `KMIP server ${kmipServerId} not found` });
    }

    return kmipServerDAL.deleteById(kmipServerId);
  };

  return {
    createKmipServer,
    updateKmipServer,
    getOrgKmipServer,
    listKmipServers,
    deleteKmipServer
  };
};
