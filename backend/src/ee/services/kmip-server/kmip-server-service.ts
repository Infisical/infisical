import type { TActorContext } from "@app/domains/lib/actor-context";
import {
  OrgPermissionKmipServerActions,
  OrgPermissionSubjects,
  TOrganizationsDomain
} from "@app/domains/platform/organizations/ce/module";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, DatabaseError, NotFoundError } from "@app/lib/errors";

import { TResourceAuthMethodServiceFactory } from "../resource-auth-method/resource-auth-method-service";
import { TKmipServerDALFactory } from "./kmip-server-dal";

export type TKmipServerServiceFactory = ReturnType<typeof kmipServerServiceFactory>;

export const kmipServerServiceFactory = ({
  kmipServerDAL,
  organizationsDomain,
  resourceAuthMethodService
}: {
  kmipServerDAL: TKmipServerDALFactory;
  organizationsDomain: Pick<TOrganizationsDomain, "getOrgPermission">;
  resourceAuthMethodService: Pick<TResourceAuthMethodServiceFactory, "initAtCreate">;
}) => {
  const $checkPermission = async (actor: TActorContext, action: OrgPermissionKmipServerActions) => {
    const permission = await organizationsDomain.getOrgPermission({ actor });
    permission.assert({ action, subject: OrgPermissionSubjects.KmipServer });
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
      | { method: "aws"; config: { allowedPrincipalArns: string; allowedAccountIds: string } }
      | { method: "token" };
    actor: TActorContext;
  }) => {
    await $checkPermission(actor, OrgPermissionKmipServerActions.CreateKmipServers);

    try {
      return await kmipServerDAL.transaction(async (tx) => {
        const created = await kmipServerDAL.create(
          { name, orgId: actor.org.id, hostnamesOrIps, ttl, keyAlgorithm },
          tx
        );
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
    ttl?: string | null;
    keyAlgorithm?: string;
    actor: TActorContext;
  }) => {
    await $checkPermission(actor, OrgPermissionKmipServerActions.EditKmipServers);

    const kmipServer = await kmipServerDAL.findOne({ id: kmipServerId, orgId: actor.org.id });
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

  const listKmipServers = async ({ actor }: { actor: TActorContext }) => {
    await $checkPermission(actor, OrgPermissionKmipServerActions.ListKmipServers);
    return kmipServerDAL.find({ orgId: actor.org.id });
  };

  const deleteKmipServer = async ({ kmipServerId, actor }: { kmipServerId: string; actor: TActorContext }) => {
    await $checkPermission(actor, OrgPermissionKmipServerActions.DeleteKmipServers);

    const kmipServer = await kmipServerDAL.findOne({ id: kmipServerId, orgId: actor.org.id });
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
