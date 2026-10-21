import { ForbiddenError } from "@casl/ability";

import { ActionProjectType } from "@app/db/schemas";
import { TGatewayPoolDALFactory } from "@app/ee/services/gateway-pool/gateway-pool-dal";
import { assertIndividualGatewayAllowed } from "@app/ee/services/gateway-pool/gateway-pool-policy-fns";
import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2DALFactory } from "@app/ee/services/gateway-v2/gateway-v2-dal";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionCertificateActions,
  ProjectPermissionCertificateAuthorityActions,
  ProjectPermissionHsmConnectorActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { isPkcs11Error, Pkcs11ErrorCode } from "@app/lib/gateway-v2/pkcs11-rpc";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { HsmKeyAlgorithm } from "@app/services/signer/signer-enums";

import type { THsmConnectorDALFactory } from "./hsm-connector-dal";
import {
  decryptHsmConnectorCredentials,
  encryptHsmConnectorCredentials,
  HsmConnectorCredentialsSchema,
  HsmConnectorSanitizedSchema
} from "./hsm-connector-fns";
import { hsmConnectorRoutingFactory } from "./hsm-connector-routing";
import type {
  TCreateHsmConnectorDTO,
  TDeleteHsmConnectorDTO,
  TGetHsmConnectorByIdDTO,
  THsmConnectorCredentials,
  THsmConnectorKey,
  THsmConnectorSanitized,
  THsmConnectorServiceActor,
  TListHsmConnectorsDTO,
  TTestHsmConnectorDTO,
  TUpdateHsmConnectorDTO
} from "./hsm-connector-types";

export type THsmConnectorServiceFactoryDep = {
  hsmConnectorDAL: THsmConnectorDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  gatewayPoolService: Pick<TGatewayPoolServiceFactory, "listHealthyGateways" | "selectGatewayFromPool">;
  gatewayV2DAL: Pick<TGatewayV2DALFactory, "findById">;
  gatewayPoolDAL: Pick<TGatewayPoolDALFactory, "findById">;
  orgDAL: Pick<TOrgDALFactory, "findById">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

export type THsmConnectorServiceFactory = ReturnType<typeof hsmConnectorServiceFactory>;

const OLD_GATEWAY_BAD_REQUEST_MESSAGE = "Invalid request";
const GATEWAY_MAX_SIGN_DATA_BYTES = 64 * 1024;

export const hsmConnectorServiceFactory = ({
  hsmConnectorDAL,
  permissionService,
  kmsService,
  gatewayV2Service,
  gatewayPoolService,
  gatewayV2DAL,
  gatewayPoolDAL,
  orgDAL,
  licenseService
}: THsmConnectorServiceFactoryDep) => {
  const routing = hsmConnectorRoutingFactory({ gatewayV2Service, gatewayPoolService });

  const assertGatewayBelongsToOrg = async (
    actorOrgId: string,
    gatewayId: string | null | undefined,
    gatewayPoolId: string | null | undefined,
    previousGatewayId?: string | null
  ) => {
    if (gatewayId) {
      const gw = await gatewayV2DAL.findById(gatewayId);
      if (!gw || gw.orgId !== actorOrgId) {
        throw new NotFoundError({ message: `Gateway ${gatewayId} not found.` });
      }
      await assertIndividualGatewayAllowed({ orgDAL, orgId: actorOrgId, gatewayId, previousGatewayId });
    }
    if (gatewayPoolId) {
      const pool = await gatewayPoolDAL.findById(gatewayPoolId);
      if (!pool || pool.orgId !== actorOrgId) {
        throw new NotFoundError({ message: `Gateway pool ${gatewayPoolId} not found.` });
      }
    }
  };

  const assertLicense = async (orgId: string) => {
    const plan = await licenseService.getPlan(orgId);
    if (!plan.hsm) {
      throw new BadRequestError({
        message: "Your plan does not include HSM support. Please upgrade to use HSM Connectors."
      });
    }
  };

  const assertProjectPermission = async (
    actor: THsmConnectorServiceActor,
    projectId: string,
    action: ProjectPermissionHsmConnectorActions
  ) => {
    await assertLicense(actor.orgId);
    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(action, ProjectPermissionSub.HsmConnectors);
  };

  const createHsmConnector = async (
    dto: TCreateHsmConnectorDTO,
    actor: THsmConnectorServiceActor
  ): Promise<THsmConnectorSanitized> => {
    await assertProjectPermission(actor, dto.projectId, ProjectPermissionHsmConnectorActions.Create);

    if (!dto.gatewayId === !dto.gatewayPoolId) {
      throw new BadRequestError({
        message: "Exactly one of gatewayId or gatewayPoolId must be set."
      });
    }

    await assertGatewayBelongsToOrg(actor.orgId, dto.gatewayId, dto.gatewayPoolId);

    const parsedCreds = HsmConnectorCredentialsSchema.safeParse(dto.credentials);
    if (!parsedCreds.success) {
      throw new BadRequestError({ message: `Invalid credentials: ${parsedCreds.error.message}` });
    }

    const testResult = await routing.runTestRoundTrip({
      gatewayId: dto.gatewayId ?? null,
      gatewayPoolId: dto.gatewayPoolId ?? null,
      credentials: parsedCreds.data
    });
    if (!testResult.ok) {
      const first = testResult.members.find((m) => !m.ok);
      throw new BadRequestError({
        message:
          first && !first.ok
            ? `Test round trip failed (${first.errorCode}): ${first.errorMessage}`
            : "Test round trip against the HSM failed."
      });
    }

    const encryptedCredentials = await encryptHsmConnectorCredentials({
      projectId: dto.projectId,
      credentials: parsedCreds.data,
      kmsService
    });

    let row: Awaited<ReturnType<typeof hsmConnectorDAL.create>>;
    try {
      row = await hsmConnectorDAL.create({
        name: dto.name,
        description: dto.description,
        projectId: dto.projectId,
        gatewayId: dto.gatewayId ?? null,
        gatewayPoolId: dto.gatewayPoolId ?? null,
        encryptedCredentials
      });
    } catch (err) {
      // 23505 = unique constraint violation: UNIQUE(projectId, name) on hsm_connectors.
      const cause = (err as { error?: { code?: string } })?.error;
      if (cause?.code === "23505") {
        throw new BadRequestError({
          message: `An HSM Connector named "${dto.name}" already exists.`
        });
      }
      throw err;
    }

    return HsmConnectorSanitizedSchema.parse({
      ...row,
      slotLabel: parsedCreds.data.slotLabel,
      keyNamePrefix: parsedCreds.data.keyNamePrefix ?? null
    });
  };

  const listHsmConnectors = async (
    dto: TListHsmConnectorsDTO,
    actor: THsmConnectorServiceActor
  ): Promise<THsmConnectorSanitized[]> => {
    await assertProjectPermission(actor, dto.projectId, ProjectPermissionHsmConnectorActions.Read);

    const rows = await hsmConnectorDAL.findByProjectId(dto.projectId);
    return Promise.all(
      rows.map(async (row) => {
        const credentials = await decryptHsmConnectorCredentials({
          projectId: row.projectId,
          encryptedCredentials: row.encryptedCredentials,
          kmsService
        });
        return HsmConnectorSanitizedSchema.parse({
          ...row,
          slotLabel: credentials.slotLabel,
          keyNamePrefix: credentials.keyNamePrefix ?? null
        });
      })
    );
  };

  const getHsmConnectorById = async (
    dto: TGetHsmConnectorByIdDTO,
    actor: THsmConnectorServiceActor
  ): Promise<THsmConnectorSanitized> => {
    const row = await hsmConnectorDAL.findById(dto.connectorId);
    if (!row) throw new NotFoundError({ message: `HSM Connector ${dto.connectorId} not found.` });

    await assertProjectPermission(actor, row.projectId, ProjectPermissionHsmConnectorActions.Read);

    const credentials = await decryptHsmConnectorCredentials({
      projectId: row.projectId,
      encryptedCredentials: row.encryptedCredentials,
      kmsService
    });
    return HsmConnectorSanitizedSchema.parse({
      ...row,
      slotLabel: credentials.slotLabel,
      keyNamePrefix: credentials.keyNamePrefix ?? null
    });
  };

  const updateHsmConnector = async (
    dto: TUpdateHsmConnectorDTO,
    actor: THsmConnectorServiceActor
  ): Promise<THsmConnectorSanitized> => {
    const row = await hsmConnectorDAL.findById(dto.connectorId);
    if (!row) throw new NotFoundError({ message: `HSM Connector ${dto.connectorId} not found.` });

    await assertProjectPermission(actor, row.projectId, ProjectPermissionHsmConnectorActions.Edit);

    let nextGatewayId: string | null = row.gatewayId ?? null;
    let nextGatewayPoolId: string | null = row.gatewayPoolId ?? null;
    const routingChanged = dto.gatewayId !== undefined || dto.gatewayPoolId !== undefined;
    if (dto.gatewayId !== undefined) {
      nextGatewayId = dto.gatewayId ?? null;
      if (nextGatewayId) nextGatewayPoolId = null;
    }
    if (dto.gatewayPoolId !== undefined) {
      nextGatewayPoolId = dto.gatewayPoolId ?? null;
      if (nextGatewayPoolId) nextGatewayId = null;
    }
    if (!nextGatewayId === !nextGatewayPoolId) {
      throw new BadRequestError({
        message: "Exactly one of gatewayId or gatewayPoolId must be set after update."
      });
    }

    if (routingChanged) {
      await assertGatewayBelongsToOrg(actor.orgId, nextGatewayId, nextGatewayPoolId, row.gatewayId);
    }

    const effectiveRoutingChanged =
      (row.gatewayId ?? null) !== nextGatewayId || (row.gatewayPoolId ?? null) !== nextGatewayPoolId;
    if (effectiveRoutingChanged && !dto.credentials?.pin) {
      throw new BadRequestError({
        message:
          "PIN must be re-supplied when changing the Gateway or Gateway Pool of an HSM Connector. Include the new pin in the request body."
      });
    }

    const currentCreds = await decryptHsmConnectorCredentials({
      projectId: row.projectId,
      encryptedCredentials: row.encryptedCredentials,
      kmsService
    });
    const credentialsChanged = dto.credentials !== undefined;
    const mergedCreds: THsmConnectorCredentials = {
      slotLabel: dto.credentials?.slotLabel ?? currentCreds.slotLabel,
      pin: dto.credentials?.pin ?? currentCreds.pin,
      keyNamePrefix: dto.credentials?.keyNamePrefix ?? currentCreds.keyNamePrefix
    };
    const parsedCreds = HsmConnectorCredentialsSchema.safeParse(mergedCreds);
    if (!parsedCreds.success) {
      throw new BadRequestError({ message: `Invalid credentials: ${parsedCreds.error.message}` });
    }

    if (routingChanged || credentialsChanged) {
      const testResult = await routing.runTestRoundTrip({
        gatewayId: nextGatewayId,
        gatewayPoolId: nextGatewayPoolId,
        credentials: parsedCreds.data
      });
      if (!testResult.ok) {
        const first = testResult.members.find((m) => !m.ok);
        throw new BadRequestError({
          message:
            first && !first.ok
              ? `Test round trip failed (${first.errorCode}): ${first.errorMessage}`
              : "Test round trip against the HSM failed."
        });
      }
    }

    const update: Record<string, unknown> = {
      gatewayId: nextGatewayId,
      gatewayPoolId: nextGatewayPoolId
    };
    if (dto.name !== undefined) update.name = dto.name;
    if (dto.description !== undefined) update.description = dto.description;
    if (credentialsChanged) {
      update.encryptedCredentials = await encryptHsmConnectorCredentials({
        projectId: row.projectId,
        credentials: parsedCreds.data,
        kmsService
      });
    }

    const updated = await hsmConnectorDAL.updateById(row.id, update);

    return HsmConnectorSanitizedSchema.parse({
      ...updated,
      slotLabel: parsedCreds.data.slotLabel,
      keyNamePrefix: parsedCreds.data.keyNamePrefix ?? null
    });
  };

  const deleteHsmConnector = async (dto: TDeleteHsmConnectorDTO, actor: THsmConnectorServiceActor) => {
    const row = await hsmConnectorDAL.findById(dto.connectorId);
    if (!row) throw new NotFoundError({ message: `HSM Connector ${dto.connectorId} not found.` });

    await assertProjectPermission(actor, row.projectId, ProjectPermissionHsmConnectorActions.Delete);

    await hsmConnectorDAL.transaction(async (tx) => {
      const [certCount, caCount] = await Promise.all([
        hsmConnectorDAL.countReferencingCertificates(row.id, tx),
        hsmConnectorDAL.countReferencingCertificateAuthorities(row.id, tx)
      ]);
      if (certCount > 0) {
        throw new BadRequestError({
          message: `HSM Connector is in use by ${certCount} certificate(s). Open the connector to see the linked certificates panel and re-issue or retire them first.`
        });
      }
      if (caCount > 0) {
        throw new BadRequestError({
          message: `HSM Connector is in use by ${caCount} certificate authority(ies). Delete or migrate those CAs before removing this connector.`
        });
      }
      try {
        await hsmConnectorDAL.deleteById(row.id, tx);
      } catch (err) {
        // 23503 = FK violation: something started referencing this connector after the count check.
        const cause = (err as { error?: { code?: string } })?.error;
        if (cause?.code === "23503") {
          throw new BadRequestError({
            message:
              "HSM Connector is in use by a certificate or certificate authority. Re-issue or retire them, or delete/migrate the CAs, before removing this connector."
          });
        }
        throw err;
      }
    });
    return { id: row.id, name: row.name, projectId: row.projectId };
  };

  const listLinkedResources = async (
    dto: { connectorId: string; offset: number; limit: number },
    actor: THsmConnectorServiceActor
  ) => {
    const row = await hsmConnectorDAL.findById(dto.connectorId);
    if (!row) throw new NotFoundError({ message: `HSM Connector ${dto.connectorId} not found.` });

    await assertProjectPermission(actor, row.projectId, ProjectPermissionHsmConnectorActions.Read);
    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId: row.projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateActions.Read,
      ProjectPermissionSub.Certificates
    );

    const includeCertificateAuthorities = permission.can(
      ProjectPermissionCertificateAuthorityActions.Read,
      ProjectPermissionSub.CertificateAuthorities
    );

    return hsmConnectorDAL.listLinkedResources(row.id, {
      offset: dto.offset,
      limit: dto.limit,
      includeCertificateAuthorities
    });
  };

  const testHsmConnector = async (dto: TTestHsmConnectorDTO, actor: THsmConnectorServiceActor) => {
    const row = await hsmConnectorDAL.findById(dto.connectorId);
    if (!row) throw new NotFoundError({ message: `HSM Connector ${dto.connectorId} not found.` });

    await assertProjectPermission(actor, row.projectId, ProjectPermissionHsmConnectorActions.Test);

    const credentials = await decryptHsmConnectorCredentials({
      projectId: row.projectId,
      encryptedCredentials: row.encryptedCredentials,
      kmsService
    });

    const result = await routing.runTestRoundTrip({
      gatewayId: row.gatewayId ?? null,
      gatewayPoolId: row.gatewayPoolId ?? null,
      credentials
    });
    return { projectId: row.projectId, name: row.name, result };
  };

  const $decryptCredentials = (row: { projectId: string; encryptedCredentials: Buffer }) =>
    decryptHsmConnectorCredentials({
      projectId: row.projectId,
      encryptedCredentials: row.encryptedCredentials,
      kmsService
    });

  const $loadConnector = async (connectorId: string, expectedProjectId: string) => {
    const row = await hsmConnectorDAL.findById(connectorId);
    if (!row || row.projectId !== expectedProjectId) {
      throw new NotFoundError({ message: `HSM Connector ${connectorId} not found.` });
    }
    return { row, credentials: await $decryptCredentials(row) };
  };

  const $rethrowKeyError = (err: unknown, keyLabel: string, keyId?: string | null): never => {
    if (
      keyId &&
      err instanceof BadRequestError &&
      err.message.endsWith(`(${Pkcs11ErrorCode.BadRequest}): ${OLD_GATEWAY_BAD_REQUEST_MESSAGE}`)
    ) {
      throw new BadRequestError({
        message: `More than one key in the HSM Connector's slot has the label '${keyLabel}', and the gateway is too old to select a key by key ID. Update the gateway to the latest version.`
      });
    }
    if (isPkcs11Error(err, Pkcs11ErrorCode.SignatureMismatch)) {
      throw new BadRequestError({
        message: `The HSM key labeled '${keyLabel}' produced a signature that doesn't verify with the certificate's public key. Check that the label points to the certificate's private key.`
      });
    }
    if (isPkcs11Error(err, Pkcs11ErrorCode.KeyAmbiguous)) {
      throw new BadRequestError({
        message: keyId
          ? `More than one key in the HSM Connector's slot has the label '${keyLabel}' and key ID '${keyId}'. Give the keys unique labels or key IDs.`
          : `More than one key in the HSM Connector's slot has the label '${keyLabel}'. Set the key ID to choose one, or give the keys unique labels.`
      });
    }
    throw err;
  };

  const generateKeyPair = async (args: {
    connectorId: string;
    projectId: string;
    keyLabel: string;
    keyAlgorithm: HsmKeyAlgorithm;
  }): Promise<{ publicKeySpkiDer: Buffer; keyLabel: string; keyId: string | null }> => {
    const { row, credentials } = await $loadConnector(args.connectorId, args.projectId);
    const prefix = credentials.keyNamePrefix ?? "";
    const fullLabel = `${prefix}${args.keyLabel}`;
    const result = await routing.dispatchPkcs11<{ publicKey: string; keyId?: string }>({
      connector: { gatewayId: row.gatewayId, gatewayPoolId: row.gatewayPoolId },
      credentials,
      endpoint: "/v1/generate-key-pair",
      params: { keyLabel: fullLabel, keyAlgorithm: args.keyAlgorithm }
    });
    return {
      publicKeySpkiDer: Buffer.from(result.publicKey, "base64"),
      keyLabel: fullLabel,
      keyId: result.keyId || null
    };
  };

  const signWithKeyId = async (args: {
    connectorId: string;
    projectId: string;
    keyLabel: string;
    keyId?: string | null;
    publicKeySpki: Buffer | null;
    mechanism: string;
    data: Buffer;
    isDigest: boolean;
  }): Promise<{ signature: Buffer; keyId: string | null }> => {
    if (args.data.length > GATEWAY_MAX_SIGN_DATA_BYTES) {
      throw new BadRequestError({
        message: `The data to sign is ${args.data.length} bytes, more than the ${GATEWAY_MAX_SIGN_DATA_BYTES} bytes the HSM Connector's gateway accepts.`
      });
    }
    const { row, credentials } = await $loadConnector(args.connectorId, args.projectId);
    const result = await routing
      .dispatchPkcs11<{ signature: string; keyId?: string }>({
        connector: { gatewayId: row.gatewayId, gatewayPoolId: row.gatewayPoolId },
        credentials,
        endpoint: "/v1/sign",
        params: {
          keyLabel: args.keyLabel,
          keyId: args.keyId ?? "",
          publicKey: args.publicKeySpki?.toString("base64") ?? "",
          mechanism: args.mechanism,
          data: args.data.toString("base64"),
          isDigest: args.isDigest
        }
      })
      .catch((err: unknown) => {
        if (isPkcs11Error(err, Pkcs11ErrorCode.KeyNotFound)) {
          throw new BadRequestError({
            message: args.keyId
              ? `No private key with the label '${args.keyLabel}' and key ID '${args.keyId}' was found in the HSM Connector's slot.`
              : `No private key labeled '${args.keyLabel}' was found in the HSM Connector's slot.`
          });
        }
        return $rethrowKeyError(err, args.keyLabel, args.keyId);
      });
    return { signature: Buffer.from(result.signature, "base64"), keyId: result.keyId || null };
  };

  const sign = async (args: Parameters<typeof signWithKeyId>[0]): Promise<Buffer> =>
    (await signWithKeyId(args)).signature;

  const getPublicKey = async (args: {
    connectorId: string;
    projectId: string;
    keyLabel: string;
    keyId?: string | null;
  }): Promise<Buffer> => {
    const { row, credentials } = await $loadConnector(args.connectorId, args.projectId);
    const result = await routing
      .dispatchPkcs11<{ publicKey: string }>({
        connector: { gatewayId: row.gatewayId, gatewayPoolId: row.gatewayPoolId },
        credentials,
        endpoint: "/v1/get-public-key",
        params: { keyLabel: args.keyLabel, keyId: args.keyId ?? "" }
      })
      .catch((err: unknown) => $rethrowKeyError(err, args.keyLabel, args.keyId));
    return Buffer.from(result.publicKey, "base64");
  };

  const listHsmConnectorKeys = async (
    dto: { connectorId: string; projectId: string; keyLabel: string },
    actor: THsmConnectorServiceActor
  ) => {
    await assertProjectPermission(actor, dto.projectId, ProjectPermissionHsmConnectorActions.Attach);
    const { row, credentials } = await $loadConnector(dto.connectorId, dto.projectId);

    const result = await routing
      .dispatchPkcs11<{ keys: THsmConnectorKey[] }>({
        connector: { gatewayId: row.gatewayId, gatewayPoolId: row.gatewayPoolId },
        credentials,
        endpoint: "/v1/find-keys",
        params: { keyLabel: dto.keyLabel }
      })
      .catch((err: unknown) => {
        if (isPkcs11Error(err, Pkcs11ErrorCode.UnsupportedGatewayVersion)) {
          throw new BadRequestError({
            message: "The HSM Connector's gateway is too old to look up keys. Update the gateway to the latest version."
          });
        }
        if (isPkcs11Error(err, Pkcs11ErrorCode.BadRequest)) {
          throw new BadRequestError({
            message: `Too many private keys in the HSM Connector's slot have the label '${dto.keyLabel}'. Give the keys unique labels.`
          });
        }
        throw err;
      });
    return { keys: result.keys };
  };

  const assertAttachPermission = async (
    actor: Pick<THsmConnectorServiceActor, "type" | "id" | "authMethod" | "orgId">,
    connectorId: string,
    projectId: string
  ) => {
    await assertProjectPermission(
      actor as THsmConnectorServiceActor,
      projectId,
      ProjectPermissionHsmConnectorActions.Attach
    );
    const row = await hsmConnectorDAL.findById(connectorId);
    if (!row || row.projectId !== projectId) {
      throw new NotFoundError({ message: `HSM Connector ${connectorId} not found.` });
    }
    return row;
  };

  return {
    createHsmConnector,
    listHsmConnectors,
    getHsmConnectorById,
    updateHsmConnector,
    deleteHsmConnector,
    testHsmConnector,
    listLinkedResources,
    assertAttachPermission,
    generateKeyPair,
    sign,
    signWithKeyId,
    getPublicKey,
    listHsmConnectorKeys
  };
};
