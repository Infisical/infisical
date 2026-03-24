import { ForbiddenError, subject } from "@casl/ability";

import { ActionProjectType } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionCertificateAuthorityActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { ActorAuthMethod, ActorType } from "@app/services/auth/auth-type";

import { TCaAutoRenewalQueueFactory } from "../ca-auto-renewal-queue";
import { TCertificateAuthorityDALFactory } from "../certificate-authority-dal";
import { CaStatus, InternalCaType } from "../certificate-authority-enums";
import { TInternalCertificateAuthorityDALFactory } from "../internal/internal-certificate-authority-dal";
import { TCaSigningConfigDALFactory } from "./ca-signing-config-dal";
import { CaSigningConfigType } from "./ca-signing-config-enums";
import {
  AzureAdCsDestinationConfigSchema,
  TAzureAdCsDestinationConfig,
  TCreateCaSigningConfigDTO,
  TGetCaSigningConfigDTO,
  TUpdateCaSigningConfigDTO,
  TVenafiDestinationConfig,
  VenafiDestinationConfigSchema
} from "./ca-signing-config-types";

type TCaSigningConfigServiceFactoryDep = {
  caSigningConfigDAL: Pick<
    TCaSigningConfigDALFactory,
    "create" | "findByCaId" | "updateById" | "deleteById" | "findOne" | "transaction"
  >;
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findById" | "findByIdWithAssociatedCa">;
  internalCertificateAuthorityDAL: Pick<TInternalCertificateAuthorityDALFactory, "findOne" | "updateById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
  caAutoRenewalQueue: Pick<TCaAutoRenewalQueueFactory, "queueVenafiInstall" | "queueAdcsInstall">;
};

export type TCaSigningConfigServiceFactory = ReturnType<typeof caSigningConfigServiceFactory>;

export const caSigningConfigServiceFactory = ({
  caSigningConfigDAL,
  certificateAuthorityDAL,
  internalCertificateAuthorityDAL,
  permissionService,
  appConnectionDAL,
  caAutoRenewalQueue
}: TCaSigningConfigServiceFactoryDep) => {
  const validateAppConnectionOrg = async (connectionId: string, actorOrgId: string) => {
    const appConnection = await appConnectionDAL.findById(connectionId);
    if (!appConnection || appConnection.orgId !== actorOrgId) {
      throw new BadRequestError({ message: "App connection not found or does not belong to your organization" });
    }
  };

  const getSigningConfigByCaId = async (internalCaId: string) => {
    const config = await caSigningConfigDAL.findByCaId(internalCaId);
    if (!config) {
      throw new NotFoundError({ message: "No signing configuration found for this CA" });
    }
    return config;
  };

  const createSigningConfig = async ({
    caId,
    type,
    parentCaId,
    appConnectionId,
    destinationConfig,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TCreateCaSigningConfigDTO & {
    actor: ActorType;
    actorId: string;
    actorAuthMethod: ActorAuthMethod;
    actorOrgId: string;
  }) => {
    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(caId);
    if (!ca) throw new NotFoundError({ message: `CA with ID ${caId} not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: ca.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateAuthorityActions.Edit,
      subject(ProjectPermissionSub.CertificateAuthorities, { name: ca.name })
    );

    const internalCa = await internalCertificateAuthorityDAL.findOne({ caId });
    if (!internalCa) throw new NotFoundError({ message: `Internal CA with caId ${caId} not found` });

    if (internalCa.type === InternalCaType.ROOT) {
      throw new BadRequestError({ message: "Root CAs are self-signed and do not require a signing configuration" });
    }

    // If a config already exists with a different type (e.g., auto-created "manual"), replace it
    const existing = await caSigningConfigDAL.findByCaId(internalCa.id);
    if (existing && existing.type === type) {
      throw new BadRequestError({ message: "Signing configuration already exists for this CA. Use update instead." });
    }

    // Venafi requires appConnectionId and destinationConfig
    if (type === CaSigningConfigType.Venafi) {
      if (!appConnectionId) {
        throw new BadRequestError({ message: "App connection ID is required for Venafi signing" });
      }
      if (!destinationConfig) {
        throw new BadRequestError({ message: "Destination config is required for Venafi signing" });
      }
      VenafiDestinationConfigSchema.parse(destinationConfig);
      await validateAppConnectionOrg(appConnectionId, actorOrgId);
    }

    // Azure AD CS requires appConnectionId and destinationConfig
    if (type === CaSigningConfigType.AzureAdCs) {
      if (!appConnectionId) {
        throw new BadRequestError({ message: "App connection ID is required for Azure AD CS signing" });
      }
      if (!destinationConfig) {
        throw new BadRequestError({ message: "Destination config is required for Azure AD CS signing" });
      }
      AzureAdCsDestinationConfigSchema.parse(destinationConfig);
      await validateAppConnectionOrg(appConnectionId, actorOrgId);
    }

    const isExternalCa = type === CaSigningConfigType.Venafi || type === CaSigningConfigType.AzureAdCs;

    const config = await caSigningConfigDAL.transaction(async (tx) => {
      if (existing) {
        await caSigningConfigDAL.deleteById(existing.id, tx);
      }

      return caSigningConfigDAL.create(
        {
          caId: internalCa.id,
          type,
          parentCaId: type === CaSigningConfigType.Internal ? parentCaId : undefined,
          appConnectionId: isExternalCa ? appConnectionId : undefined,
          destinationConfig: isExternalCa ? destinationConfig : undefined
        },
        tx
      );
    });

    return { config, ca: { id: ca.id, dn: ca.internalCa?.dn ?? "", projectId: ca.projectId } };
  };

  const getSigningConfig = async ({
    caId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TGetCaSigningConfigDTO & {
    actor: ActorType;
    actorId: string;
    actorAuthMethod: ActorAuthMethod;
    actorOrgId: string;
  }) => {
    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(caId);
    if (!ca) throw new NotFoundError({ message: `CA with ID ${caId} not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: ca.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateAuthorityActions.Read,
      subject(ProjectPermissionSub.CertificateAuthorities, { name: ca.name })
    );

    const internalCa = await internalCertificateAuthorityDAL.findOne({ caId });
    if (!internalCa) throw new NotFoundError({ message: `Internal CA with caId ${caId} not found` });

    if (internalCa.type === InternalCaType.ROOT) {
      return { config: null, ca: { id: ca.id, dn: ca.internalCa?.dn ?? "", projectId: ca.projectId } };
    }

    const config = await getSigningConfigByCaId(internalCa.id);

    return { config, ca: { id: ca.id, dn: ca.internalCa?.dn ?? "", projectId: ca.projectId } };
  };

  const updateSigningConfig = async ({
    caId,
    parentCaId,
    appConnectionId,
    destinationConfig,
    lastExternalCertificateId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TUpdateCaSigningConfigDTO & {
    actor: ActorType;
    actorId: string;
    actorAuthMethod: ActorAuthMethod;
    actorOrgId: string;
  }) => {
    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(caId);
    if (!ca) throw new NotFoundError({ message: `CA with ID ${caId} not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: ca.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateAuthorityActions.Edit,
      subject(ProjectPermissionSub.CertificateAuthorities, { name: ca.name })
    );

    const internalCa = await internalCertificateAuthorityDAL.findOne({ caId });
    if (!internalCa) throw new NotFoundError({ message: `Internal CA with caId ${caId} not found` });

    const existing = await caSigningConfigDAL.findByCaId(internalCa.id);
    if (!existing) throw new NotFoundError({ message: "No signing configuration found for this CA" });

    // Type cannot be changed
    const updateData: {
      parentCaId?: string | null;
      appConnectionId?: string;
      destinationConfig?: TVenafiDestinationConfig | TAzureAdCsDestinationConfig;
      lastExternalCertificateId?: string;
    } = {};

    if (existing.type === CaSigningConfigType.Internal && parentCaId !== undefined) {
      updateData.parentCaId = parentCaId;
    }

    if (existing.type === CaSigningConfigType.Venafi) {
      if (appConnectionId !== undefined) {
        await validateAppConnectionOrg(appConnectionId, actorOrgId);
        updateData.appConnectionId = appConnectionId;
      }
      if (destinationConfig !== undefined) {
        VenafiDestinationConfigSchema.parse(destinationConfig);
        updateData.destinationConfig = destinationConfig;
      }
      if (lastExternalCertificateId !== undefined) updateData.lastExternalCertificateId = lastExternalCertificateId;
    }

    if (existing.type === CaSigningConfigType.AzureAdCs) {
      if (appConnectionId !== undefined) {
        await validateAppConnectionOrg(appConnectionId, actorOrgId);
        updateData.appConnectionId = appConnectionId;
      }
      if (destinationConfig !== undefined) {
        AzureAdCsDestinationConfigSchema.parse(destinationConfig);
        updateData.destinationConfig = destinationConfig;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return { config: existing, ca: { id: ca.id, dn: ca.internalCa?.dn ?? "", projectId: ca.projectId } };
    }

    const config = await caSigningConfigDAL.updateById(existing.id, updateData);
    return { config, ca: { id: ca.id, dn: ca.internalCa?.dn ?? "", projectId: ca.projectId } };
  };

  const getAutoRenewalConfig = async ({
    caId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TGetCaSigningConfigDTO & {
    actor: ActorType;
    actorId: string;
    actorAuthMethod: ActorAuthMethod;
    actorOrgId: string;
  }) => {
    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(caId);
    if (!ca) throw new NotFoundError({ message: `CA with ID ${caId} not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: ca.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateAuthorityActions.Read,
      subject(ProjectPermissionSub.CertificateAuthorities, { name: ca.name })
    );

    const internalCa = await internalCertificateAuthorityDAL.findOne({ caId });
    if (!internalCa) throw new NotFoundError({ message: `Internal CA with caId ${caId} not found` });

    return {
      autoRenewalEnabled: internalCa.autoRenewalEnabled ?? false,
      autoRenewalDaysBeforeExpiry: internalCa.autoRenewalDaysBeforeExpiry ?? null,
      lastRenewalStatus: internalCa.lastRenewalStatus ?? null,
      lastRenewalMessage: internalCa.lastRenewalMessage ?? null,
      lastRenewalAt: internalCa.lastRenewalAt ?? null,
      ca: { id: ca.id, dn: ca.internalCa?.dn ?? "", projectId: ca.projectId }
    };
  };

  const updateAutoRenewalConfig = async ({
    caId,
    autoRenewalEnabled,
    autoRenewalDaysBeforeExpiry,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: {
    caId: string;
    autoRenewalEnabled?: boolean;
    autoRenewalDaysBeforeExpiry?: number;
    actor: ActorType;
    actorId: string;
    actorAuthMethod: ActorAuthMethod;
    actorOrgId: string;
  }) => {
    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(caId);
    if (!ca) throw new NotFoundError({ message: `CA with ID ${caId} not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: ca.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateAuthorityActions.Edit,
      subject(ProjectPermissionSub.CertificateAuthorities, { name: ca.name })
    );

    const internalCa = await internalCertificateAuthorityDAL.findOne({ caId });
    if (!internalCa) throw new NotFoundError({ message: `Internal CA with caId ${caId} not found` });

    if (autoRenewalEnabled && ca.status !== CaStatus.ACTIVE) {
      throw new BadRequestError({ message: "CA must be active to enable auto-renewal" });
    }

    if (autoRenewalEnabled && !autoRenewalDaysBeforeExpiry && !internalCa.autoRenewalDaysBeforeExpiry) {
      throw new BadRequestError({
        message: "autoRenewalDaysBeforeExpiry must be provided when enabling auto-renewal"
      });
    }

    const effectiveDaysBeforeExpiry = autoRenewalDaysBeforeExpiry ?? internalCa.autoRenewalDaysBeforeExpiry;

    if (effectiveDaysBeforeExpiry !== undefined && effectiveDaysBeforeExpiry !== null) {
      const MAX_DAYS_BEFORE_EXPIRY = 30;
      if (effectiveDaysBeforeExpiry > MAX_DAYS_BEFORE_EXPIRY) {
        throw new BadRequestError({
          message: `autoRenewalDaysBeforeExpiry cannot exceed ${MAX_DAYS_BEFORE_EXPIRY} days`
        });
      }

      if (internalCa.notBefore && internalCa.notAfter) {
        const ttlDays = Math.floor(
          (new Date(internalCa.notAfter).getTime() - new Date(internalCa.notBefore).getTime()) / (1000 * 60 * 60 * 24)
        );
        if (effectiveDaysBeforeExpiry >= ttlDays) {
          throw new BadRequestError({
            message: `autoRenewalDaysBeforeExpiry (${effectiveDaysBeforeExpiry}) must be less than the certificate's TTL (${ttlDays} days)`
          });
        }
      }
    }

    if (autoRenewalEnabled && internalCa.type !== InternalCaType.ROOT) {
      const signingConfig = await getSigningConfigByCaId(internalCa.id);

      if (signingConfig.type === CaSigningConfigType.Manual) {
        throw new BadRequestError({
          message: "Auto-renewal cannot be enabled for CAs with manual signing configuration"
        });
      }
    }

    const updateData: {
      autoRenewalEnabled?: boolean;
      autoRenewalDaysBeforeExpiry?: number;
      lastRenewalStatus?: string | null;
      lastRenewalMessage?: string | null;
    } = {};
    if (autoRenewalEnabled !== undefined) updateData.autoRenewalEnabled = autoRenewalEnabled;
    if (autoRenewalDaysBeforeExpiry !== undefined) updateData.autoRenewalDaysBeforeExpiry = autoRenewalDaysBeforeExpiry;

    if (autoRenewalEnabled) {
      updateData.lastRenewalStatus = null;
      updateData.lastRenewalMessage = null;
    }

    if (Object.keys(updateData).length === 0) {
      return {
        autoRenewalEnabled: internalCa.autoRenewalEnabled ?? false,
        autoRenewalDaysBeforeExpiry: internalCa.autoRenewalDaysBeforeExpiry ?? null,
        lastRenewalStatus: internalCa.lastRenewalStatus ?? null,
        lastRenewalMessage: internalCa.lastRenewalMessage ?? null,
        lastRenewalAt: internalCa.lastRenewalAt ?? null,
        ca: { id: ca.id, dn: ca.internalCa?.dn ?? "", projectId: ca.projectId }
      };
    }

    const updated = await internalCertificateAuthorityDAL.updateById(internalCa.id, updateData);

    return {
      autoRenewalEnabled: updated.autoRenewalEnabled ?? false,
      autoRenewalDaysBeforeExpiry: updated.autoRenewalDaysBeforeExpiry ?? null,
      lastRenewalStatus: updated.lastRenewalStatus ?? null,
      lastRenewalMessage: updated.lastRenewalMessage ?? null,
      lastRenewalAt: updated.lastRenewalAt ?? null,
      ca: { id: ca.id, dn: ca.internalCa?.dn ?? "", projectId: ca.projectId }
    };
  };

  const installCertificateVenafi = async ({
    caId,
    maxPathLength,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: {
    caId: string;
    maxPathLength?: number;
    actor: ActorType;
    actorId: string;
    actorAuthMethod: ActorAuthMethod;
    actorOrgId: string;
  }) => {
    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(caId);
    if (!ca) throw new NotFoundError({ message: `CA with ID ${caId} not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: ca.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateAuthorityActions.Edit,
      subject(ProjectPermissionSub.CertificateAuthorities, { name: ca.name })
    );

    const internalCa = await internalCertificateAuthorityDAL.findOne({ caId });
    if (!internalCa) throw new NotFoundError({ message: `Internal CA with caId ${caId} not found` });

    const signingConfig = await getSigningConfigByCaId(internalCa.id);

    if (signingConfig.type !== CaSigningConfigType.Venafi) {
      throw new BadRequestError({ message: "CA signing config is not configured for Venafi" });
    }

    if (!signingConfig.appConnectionId) {
      throw new BadRequestError({ message: "Venafi signing config is missing app connection" });
    }

    const parseResult = VenafiDestinationConfigSchema.safeParse(signingConfig.destinationConfig);
    if (!parseResult.success) {
      throw new BadRequestError({ message: "Venafi signing config has invalid or missing destination configuration" });
    }

    await caAutoRenewalQueue.queueVenafiInstall(caId, maxPathLength);

    return { ca: { id: ca.id, dn: ca.internalCa?.dn ?? "", projectId: ca.projectId } };
  };

  const installCertificateAzureAdCs = async ({
    caId,
    maxPathLength,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: {
    caId: string;
    maxPathLength?: number;
    actor: ActorType;
    actorId: string;
    actorAuthMethod: ActorAuthMethod;
    actorOrgId: string;
  }) => {
    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(caId);
    if (!ca) throw new NotFoundError({ message: `CA with ID ${caId} not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: ca.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateAuthorityActions.Edit,
      subject(ProjectPermissionSub.CertificateAuthorities, { name: ca.name })
    );

    const internalCa = await internalCertificateAuthorityDAL.findOne({ caId });
    if (!internalCa) throw new NotFoundError({ message: `Internal CA with caId ${caId} not found` });

    const signingConfig = await getSigningConfigByCaId(internalCa.id);

    if (signingConfig.type !== CaSigningConfigType.AzureAdCs) {
      throw new BadRequestError({ message: "CA signing config is not configured for Azure AD CS" });
    }

    if (!signingConfig.appConnectionId) {
      throw new BadRequestError({ message: "Azure AD CS signing config is missing app connection" });
    }

    const parseResult = AzureAdCsDestinationConfigSchema.safeParse(signingConfig.destinationConfig);
    if (!parseResult.success) {
      throw new BadRequestError({
        message: "Azure AD CS signing config has invalid or missing destination configuration"
      });
    }

    await caAutoRenewalQueue.queueAdcsInstall(caId, maxPathLength);

    return { ca: { id: ca.id, dn: ca.internalCa?.dn ?? "", projectId: ca.projectId } };
  };

  return {
    createSigningConfig,
    getSigningConfig,
    updateSigningConfig,
    getAutoRenewalConfig,
    updateAutoRenewalConfig,
    installCertificateVenafi,
    installCertificateAzureAdCs
  };
};
