/* eslint-disable no-await-in-loop */
import crypto from "crypto";
import RE2 from "re2";

import { TCertificateSyncs } from "@app/db/schemas";
import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { logger } from "@app/lib/logger";
import {
  describePanOsError,
  getConfigRoot,
  getEntries,
  isPanorama,
  listPanoramaTemplates,
  PAN_OS_LOCALHOST_ENTRY,
  PanOsApiError,
  TPanOsClient,
  withPanOsClient
} from "@app/services/app-connection/palo-alto-networks/palo-alto-networks-connection-fns";
import { TPaloAltoNetworksConnection } from "@app/services/app-connection/palo-alto-networks/palo-alto-networks-connection-types";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { splitPemChain } from "@app/services/certificate/certificate-fns";
import { TCertificateSyncDALFactory } from "@app/services/certificate-sync/certificate-sync-dal";
import { CertificateSyncStatus } from "@app/services/certificate-sync/certificate-sync-enums";
import { TCertificateMap } from "@app/services/pki-sync/pki-sync-types";

import {
  buildManagedCertificateNameRegexSource,
  certificateNameSchemaHasFreeTextPlaceholder,
  compileCertificateNameSchema,
  SHORT_UUID_NAME_REGEX_FRAGMENT,
  UUID_NAME_REGEX_FRAGMENT
} from "../pki-sync-certificate-name-fns";
import { PkiSync } from "../pki-sync-enums";
import { PkiSyncError } from "../pki-sync-errors";
import { TPkiSyncWithCredentials } from "../pki-sync-types";
import {
  PALO_ALTO_NETWORKS_CA_CERTIFICATE_PREFIX,
  PALO_ALTO_NETWORKS_PKI_SYNC_DESTINATIONS,
  PALO_ALTO_NETWORKS_PKI_SYNC_LIST_OPTION
} from "./palo-alto-networks-pki-sync-constants";
import { TPaloAltoNetworksPkiSyncConfig, TPaloAltoNetworksPkiSyncOptions } from "./palo-alto-networks-pki-sync-types";

type TPaloAltoNetworksPkiSyncFactoryDeps = {
  certificateSyncDAL: Pick<
    TCertificateSyncDALFactory,
    | "removeCertificates"
    | "findByPkiSyncId"
    | "bulkUpdateSyncStatus"
    | "findExternalIdentifiersInUse"
    | "claimExternalIdentifier"
    | "setSyncMetadataFlag"
    | "clearSyncMetadataFlag"
  >;
  certificateDAL: Pick<TCertificateDALFactory, "find">;
  gatewayV2Service?: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  gatewayPoolService?: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">;
};

const CERTIFICATE_ID_PLACEHOLDER = new RE2("\\{\\{(certificateId|shortCertificateId)\\}\\}");
const DEPLOY_PENDING_FLAG = "panOsDeployPending";
const REMOVE_PENDING_FLAG = "panOsRemovePending";
const PASSPHRASE_VALUE_PATTERN = new RE2("value: \\S+", "g");
const UNSUPPORTED_DESCRIPTION_PATTERN = new RE2("description", "i");
const MAX_COMMIT_DESCRIPTION_LENGTH = 255;

const hasSyncMetadataFlag = (record: TCertificateSyncs, flag: string) =>
  Boolean((record.syncMetadata as Record<string, unknown> | null)?.[flag]);

const hasDeployPending = (records: TCertificateSyncs[]) =>
  records.some((record) => hasSyncMetadataFlag(record, DEPLOY_PENDING_FLAG));

const escapeXml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const getFingerprint = (pem: string) => {
  try {
    return new crypto.X509Certificate(pem).fingerprint256;
  } catch {
    return undefined;
  }
};

const getScopeXpath = (config: TPaloAltoNetworksPkiSyncConfig, vsys?: string) =>
  vsys
    ? `${getConfigRoot(config.template)}/devices/${PAN_OS_LOCALHOST_ENTRY}/vsys/entry[@name='${vsys}']`
    : `${getConfigRoot(config.template)}/shared`;

const getCertificatesXpath = (config: TPaloAltoNetworksPkiSyncConfig, vsys?: string) =>
  `${getScopeXpath(config, vsys)}/certificate`;

const getCertificateEntryXpath = (config: TPaloAltoNetworksPkiSyncConfig, name: string) =>
  `${getCertificatesXpath(config)}/entry[@name='${name}']`;

const getProfileXpath = (config: TPaloAltoNetworksPkiSyncConfig) => {
  const scope = getScopeXpath(config, config.sslTlsServiceProfileVsys);
  return `${scope}/ssl-tls-service-profile/entry[@name='${config.sslTlsServiceProfileName}']`;
};

const getImportTarget = ({ template }: TPaloAltoNetworksPkiSyncConfig): Record<string, string> =>
  template ? { "target-tpl": template } : {};

const assertDeviceMatchesConfig = async (client: TPanOsClient, config: TPaloAltoNetworksPkiSyncConfig) => {
  const panorama = await isPanorama(client);
  if (panorama && !config.template) {
    throw new PkiSyncError({
      message:
        "The connection points to a Panorama. Select the template the certificates should be stored in, then sync again.",
      shouldRetry: false
    });
  }
  if (panorama && config.template && !(await listPanoramaTemplates(client)).includes(config.template)) {
    throw new PkiSyncError({
      message: `Template '${config.template}' was not found on the Panorama. Select an existing template, then sync again.`,
      shouldRetry: false
    });
  }
  if (!panorama && config.template) {
    throw new PkiSyncError({
      message: `The connection points to a firewall, not a Panorama, so template '${config.template}' cannot be used. Remove the template from the sync.`,
      shouldRetry: false
    });
  }
  return panorama;
};

const toFingerprintMap = (certificateNode: unknown) =>
  new Map(
    getEntries(certificateNode).map((entry) => [
      String(entry["@_name"]),
      typeof entry["public-key"] === "string" ? getFingerprint(entry["public-key"]) : undefined
    ])
  );

const listCertificates = async (client: TPanOsClient, config: TPaloAltoNetworksPkiSyncConfig, vsys?: string) =>
  toFingerprintMap((await client.getConfig(getCertificatesXpath(config, vsys))).certificate);

const importCaChain = async (
  client: TPanOsClient,
  config: TPaloAltoNetworksPkiSyncConfig,
  certificateChain: string | undefined,
  existingCertificates: Map<string, string | undefined>,
  knownFingerprints: Set<string | undefined>
) => {
  let imported = false;
  for (const caPem of splitPemChain(certificateChain ?? "")) {
    const fingerprint = getFingerprint(caPem);
    // eslint-disable-next-line no-continue
    if (!fingerprint || knownFingerprints.has(fingerprint)) continue;

    const name = `${PALO_ALTO_NETWORKS_CA_CERTIFICATE_PREFIX}${fingerprint.replaceAll(":", "").slice(0, 24).toLowerCase()}`;
    await client.importFile(
      { type: "import", category: "certificate", "certificate-name": name, format: "pem", ...getImportTarget(config) },
      `${name}.pem`,
      caPem
    );
    existingCertificates.set(name, fingerprint);
    knownFingerprints.add(fingerprint);
    imported = true;
  }
  return imported;
};

const importKeyPair = async (
  client: TPanOsClient,
  config: TPaloAltoNetworksPkiSyncConfig,
  name: string,
  cert: string,
  privateKey: string
) => {
  const passphrase = crypto.randomBytes(16).toString("base64url");
  const encryptedKey = crypto
    .createPrivateKey(privateKey)
    .export({ type: "pkcs8", format: "pem", cipher: "aes-256-cbc", passphrase })
    .toString();

  try {
    await client.importFile(
      {
        type: "import",
        category: "keypair",
        "certificate-name": name,
        format: "pem",
        passphrase,
        ...getImportTarget(config)
      },
      `${name}.pem`,
      `${cert.trim()}\n${encryptedKey}`
    );
  } catch (error) {
    throw new PanOsApiError(
      describePanOsError(error)
        .replaceAll(passphrase, "[redacted]")
        .replace(PASSPHRASE_VALUE_PATTERN, "value: [redacted]")
    );
  }
};

const getProfileCertificate = async (client: TPanOsClient, config: TPaloAltoNetworksPkiSyncConfig) => {
  const profile = getEntries(await client.getConfig(getProfileXpath(config)))[0];
  if (!profile) {
    throw new PkiSyncError({
      message: `SSL/TLS service profile '${config.sslTlsServiceProfileName}' was not found${config.sslTlsServiceProfileVsys ? ` in virtual system '${config.sslTlsServiceProfileVsys}'` : ""}. Create it on the device or update the sync.`,
      shouldRetry: false
    });
  }
  return typeof profile.certificate === "string" ? profile.certificate : undefined;
};

const waitForCommitJob = async (client: TPanOsClient, jobId: string | undefined, label: string) => {
  if (!jobId) return;
  const job = await client.waitForJob(jobId);
  const failedDevices = job.devices.filter((device) => device.result !== "OK");
  if (job.result !== "OK" || failedDevices.length > 0) {
    const reasons = failedDevices.length
      ? failedDevices.map((device) => `${device.name}: ${device.details.join(" ") || device.result}`).join("; ")
      : job.details.join(" ");
    throw new PkiSyncError({
      message: `${label} failed${failedDevices.length ? ` on ${failedDevices.length} of ${job.devices.length} firewalls` : ""}: ${reasons || "no details returned"}`,
      shouldRetry: true
    });
  }
};

const startCommitWithDescription = async (
  client: TPanOsClient,
  action: string,
  description: string,
  buildCmd: (descriptionElement: string) => string
) => {
  const descriptionElement = `<description>${escapeXml(description.slice(0, MAX_COMMIT_DESCRIPTION_LENGTH))}</description>`;
  try {
    return await client.startCommit({ action, cmd: buildCmd(descriptionElement) });
  } catch (error) {
    if (!(error instanceof PanOsApiError) || !UNSUPPORTED_DESCRIPTION_PATTERN.test(error.message)) throw error;
    return client.startCommit({ action, cmd: buildCmd("") });
  }
};

const commitAndPush = async (
  client: TPanOsClient,
  config: TPaloAltoNetworksPkiSyncConfig,
  { panorama, description }: { panorama: boolean; description: string }
) => {
  const commitJobId = await startCommitWithDescription(
    client,
    "partial",
    description,
    (descriptionElement) =>
      `<commit><partial>${descriptionElement}<admin><member>${escapeXml(client.username)}</member></admin></partial></commit>`
  );
  await waitForCommitJob(client, commitJobId, panorama ? "Commit to Panorama" : "Commit");

  if (!panorama || !config.pushToDevices || !config.template) return;

  const stacksResult = await client.getConfig(`/config/devices/${PAN_OS_LOCALHOST_ENTRY}/template-stack`);
  const stacks = getEntries(stacksResult["template-stack"])
    .filter((stack) =>
      ((stack.templates as { member?: unknown[] } | undefined)?.member ?? []).map(String).includes(config.template!)
    )
    .map((stack) => String(stack["@_name"]));

  if (stacks.length === 0) {
    throw new PkiSyncError({
      message: `Template '${config.template}' is not part of any template stack, so it cannot be pushed to firewalls. Add it to a template stack, or turn off Push to Devices.`,
      shouldRetry: false
    });
  }

  for (const stack of stacks) {
    await waitForCommitJob(
      client,
      await startCommitWithDescription(
        client,
        "all",
        description,
        (descriptionElement) =>
          `<commit-all><template-stack><name>${escapeXml(stack)}</name>${descriptionElement}</template-stack></commit-all>`
      ),
      `Push of template stack '${stack}'`
    );
  }
};

export const buildManagedCertNamePattern = (certificateNameSchema: string | undefined): RE2 => {
  const pattern = buildManagedCertificateNameRegexSource(
    certificateNameSchema ?? PALO_ALTO_NETWORKS_PKI_SYNC_LIST_OPTION.defaultCertificateNameSchema,
    {
      uuid: UUID_NAME_REGEX_FRAGMENT,
      shortUuid: SHORT_UUID_NAME_REGEX_FRAGMENT,
      freeText: "[a-zA-Z0-9_-]*"
    }
  );
  return new RE2(`^${pattern}$`);
};

type TPlannedUpload = TCertificateMap[string] & {
  mapKey: string;
  name: string;
  oldCertificateIdToRemove?: string;
  replacedName?: string;
};

type TSyncFailure = { name: string; error: string };

const planUploads = ({
  pkiSync,
  certificateMap,
  syncRecordsByCertId,
  certificatesById,
  existingCertificates,
  removePendingCertificateIds
}: {
  pkiSync: TPkiSyncWithCredentials;
  certificateMap: TCertificateMap;
  syncRecordsByCertId: Map<string, TCertificateSyncs>;
  certificatesById: Map<string, { renewedByCertificateId?: string | null; renewedFromCertificateId?: string | null }>;
  existingCertificates: Map<string, string | undefined>;
  removePendingCertificateIds: Set<string>;
}) => {
  const { preserveItemOnRenewal, certificateNameSchema } = pkiSync.syncOptions as TPaloAltoNetworksPkiSyncOptions;
  const plannedUploads: TPlannedUpload[] = [];
  const activeNames = new Set<string>();
  const skippedCertificates: Array<{ name: string; reason: string }> = [];

  for (const [mapKey, certData] of Object.entries(certificateMap)) {
    const { cert, privateKey, certificateId } = certData;

    // eslint-disable-next-line no-continue
    if (certificateId && removePendingCertificateIds.has(certificateId)) continue;

    if (!cert || !privateKey) {
      const existingName = certificateId ? syncRecordsByCertId.get(certificateId)?.externalIdentifier : undefined;
      if (existingName) activeNames.add(existingName);
      skippedCertificates.push({ name: mapKey, reason: "Missing certificate or private key data" });
      // eslint-disable-next-line no-continue
      continue;
    }

    const certificate = certificateId ? certificatesById.get(certificateId) : undefined;
    if (certificate?.renewedByCertificateId) {
      skippedCertificates.push({
        name: mapKey,
        reason: "Certificate has been renewed and replaced by a newer certificate"
      });
      // eslint-disable-next-line no-continue
      continue;
    }

    let name = mapKey;
    let oldCertificateIdToRemove: string | undefined;
    let replacedName: string | undefined;

    if (certificateId) {
      const renewedFromRecord = certificate?.renewedFromCertificateId
        ? syncRecordsByCertId.get(certificate.renewedFromCertificateId)
        : undefined;
      const directRecord = syncRecordsByCertId.get(certificateId);

      if (renewedFromRecord?.externalIdentifier && preserveItemOnRenewal) {
        name = renewedFromRecord.externalIdentifier;
        oldCertificateIdToRemove = certificate?.renewedFromCertificateId ?? undefined;
      } else if (certificate?.renewedFromCertificateId && !preserveItemOnRenewal) {
        replacedName = renewedFromRecord?.externalIdentifier ?? directRecord?.externalIdentifier ?? undefined;
        name = compileCertificateNameSchema(
          certificateNameSchema ?? PALO_ALTO_NETWORKS_PKI_SYNC_LIST_OPTION.defaultCertificateNameSchema,
          {
            certificateId,
            profileId: certData.profileId,
            applicationId: pkiSync.applicationId,
            applicationName: pkiSync.applicationName,
            commonName: certData.commonName
          },
          PkiSync.PaloAltoNetworks
        );
      } else if (directRecord?.externalIdentifier && existingCertificates.has(directRecord.externalIdentifier)) {
        name = directRecord.externalIdentifier;
      }
    }

    activeNames.add(name);
    plannedUploads.push({ ...certData, mapKey, name, oldCertificateIdToRemove, replacedName });
  }

  return { plannedUploads, activeNames, skippedCertificates };
};

const getNewestLinkedUpload = (uploads: TPlannedUpload[], syncRecordsByCertId: Map<string, TCertificateSyncs>) => {
  const linkedAt = (upload: TPlannedUpload) =>
    syncRecordsByCertId.get(upload.certificateId ?? "")?.createdAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
  return uploads.reduce<TPlannedUpload | undefined>(
    (newest, upload) => (!newest || linkedAt(upload) >= linkedAt(newest) ? upload : newest),
    undefined
  );
};

export const paloAltoNetworksPkiSyncFactory = ({
  certificateSyncDAL,
  certificateDAL,
  gatewayV2Service,
  gatewayPoolService
}: TPaloAltoNetworksPkiSyncFactoryDeps) => {
  const withClient = async <T>(
    pkiSync: TPkiSyncWithCredentials,
    operation: (client: TPanOsClient, panorama: boolean, config: TPaloAltoNetworksPkiSyncConfig) => Promise<T>
  ) => {
    const connection = {
      ...pkiSync.connection,
      credentials: pkiSync.connection.credentials as TPaloAltoNetworksConnection["credentials"]
    };
    const config = pkiSync.destinationConfig as TPaloAltoNetworksPkiSyncConfig;
    let pkiSyncError: PkiSyncError | undefined;

    try {
      return await withPanOsClient(connection, { gatewayV2Service, gatewayPoolService }, async (client) => {
        try {
          return await operation(client, await assertDeviceMatchesConfig(client, config), config);
        } catch (error) {
          if (error instanceof PkiSyncError) pkiSyncError = error;
          throw error;
        }
      });
    } catch (error) {
      if (pkiSyncError) throw pkiSyncError;
      throw new PkiSyncError({
        message: `Palo Alto Networks device '${connection.credentials.hostname}' could not complete the request: ${describePanOsError(error)}`,
        cause: error instanceof Error ? error : undefined,
        shouldRetry: true
      });
    }
  };

  const createDeployPendingMarker = (pkiSyncId: string) => {
    let isMarked = false;
    return {
      mark: async () => {
        if (isMarked) return;
        await certificateSyncDAL.setSyncMetadataFlag(pkiSyncId, DEPLOY_PENDING_FLAG);
        isMarked = true;
      },
      isMarked: () => isMarked
    };
  };

  type TDeployPendingMarker = ReturnType<typeof createDeployPendingMarker>;

  const findNamesOwnedByOtherSyncs = (pkiSync: TPkiSyncWithCredentials, names: string[]) =>
    certificateSyncDAL.findExternalIdentifiersInUse(names, {
      excludePkiSyncId: pkiSync.id,
      destination: PALO_ALTO_NETWORKS_PKI_SYNC_DESTINATIONS
    });

  const finishDeploy = async ({
    client,
    config,
    panorama,
    pkiSyncId,
    existingSyncRecords,
    hasDeviceChanges,
    deployPending,
    description
  }: {
    client: TPanOsClient;
    config: TPaloAltoNetworksPkiSyncConfig;
    panorama: boolean;
    pkiSyncId: string;
    description: string;
    existingSyncRecords: TCertificateSyncs[];
    hasDeviceChanges: boolean;
    deployPending: TDeployPendingMarker;
  }) => {
    const isDeployPending = hasDeployPending(existingSyncRecords);
    if (hasDeviceChanges || isDeployPending) {
      await commitAndPush(client, config, { panorama, description });
    }
    if (isDeployPending || deployPending.isMarked()) {
      await certificateSyncDAL.clearSyncMetadataFlag(pkiSyncId, DEPLOY_PENDING_FLAG);
    }
  };

  const importPlannedUploads = async ({
    client,
    config,
    pkiSyncId,
    plannedUploads,
    existingCertificates,
    knownCaFingerprints,
    deployPending
  }: {
    client: TPanOsClient;
    config: TPaloAltoNetworksPkiSyncConfig;
    pkiSyncId: string;
    plannedUploads: TPlannedUpload[];
    existingCertificates: Map<string, string | undefined>;
    knownCaFingerprints: Set<string | undefined>;
    deployPending: TDeployPendingMarker;
  }) => {
    const succeeded: TPlannedUpload[] = [];
    const failedUploads: TSyncFailure[] = [];
    let hasDeviceChanges = false;

    for (const upload of plannedUploads) {
      try {
        if (upload.certificateId) {
          await certificateSyncDAL.claimExternalIdentifier(pkiSyncId, upload.certificateId, upload.name);
        }
        await deployPending.mark();

        const importedCa = await importCaChain(
          client,
          config,
          upload.fullCertificateChain ?? upload.certificateChain,
          existingCertificates,
          knownCaFingerprints
        );
        hasDeviceChanges ||= importedCa;

        const fingerprint = getFingerprint(upload.cert);
        if (!fingerprint || existingCertificates.get(upload.name) !== fingerprint) {
          await importKeyPair(client, config, upload.name, upload.cert, upload.privateKey);
          hasDeviceChanges = true;
          existingCertificates.set(upload.name, fingerprint);
        }

        succeeded.push(upload);
      } catch (error) {
        failedUploads.push({ name: upload.mapKey, error: describePanOsError(error) });
        logger.error(
          { error },
          `Palo Alto Networks PKI sync failed to import certificate [syncId=${pkiSyncId}] [name=${upload.name}]`
        );
      }
    }

    return { succeeded, failedUploads, hasDeviceChanges };
  };

  const removeOrphanedCertificates = async ({
    client,
    config,
    pkiSync,
    existingSyncRecords,
    existingCertificates,
    activeNames,
    deployPending
  }: {
    client: TPanOsClient;
    config: TPaloAltoNetworksPkiSyncConfig;
    pkiSync: TPkiSyncWithCredentials;
    existingSyncRecords: TCertificateSyncs[];
    existingCertificates: Map<string, string | undefined>;
    activeNames: Set<string>;
    deployPending: TDeployPendingMarker;
  }) => {
    const { certificateNameSchema } = pkiSync.syncOptions as TPaloAltoNetworksPkiSyncOptions;
    const failedRemovals: TSyncFailure[] = [];
    let removedCount = 0;

    const candidates = new Set(
      existingSyncRecords
        .map((record) => record.externalIdentifier)
        .filter(
          (name): name is string =>
            Boolean(name) && !activeNames.has(name as string) && existingCertificates.has(name as string)
        )
    );

    if (
      CERTIFICATE_ID_PLACEHOLDER.test(
        certificateNameSchema ?? PALO_ALTO_NETWORKS_PKI_SYNC_LIST_OPTION.defaultCertificateNameSchema
      ) &&
      !certificateNameSchemaHasFreeTextPlaceholder(certificateNameSchema)
    ) {
      const managedPattern = buildManagedCertNamePattern(certificateNameSchema);
      existingCertificates.forEach((_, name) => {
        if (
          managedPattern.test(name) &&
          !activeNames.has(name) &&
          !name.startsWith(PALO_ALTO_NETWORKS_CA_CERTIFICATE_PREFIX)
        ) {
          candidates.add(name);
        }
      });
    }

    const ownedByOtherSync = await findNamesOwnedByOtherSyncs(pkiSync, [...candidates]);

    for (const name of candidates) {
      // eslint-disable-next-line no-continue
      if (ownedByOtherSync.has(name)) continue;
      await deployPending.mark();
      try {
        await client.deleteConfig(getCertificateEntryXpath(config, name));
        existingCertificates.delete(name);
        removedCount += 1;
      } catch (error) {
        failedRemovals.push({ name, error: describePanOsError(error) });
      }
    }

    return { removedCount, failedRemovals };
  };

  const syncCertificates = async (pkiSync: TPkiSyncWithCredentials, certificateMap: TCertificateMap) => {
    const { canRemoveCertificates } = pkiSync.syncOptions as TPaloAltoNetworksPkiSyncOptions;

    const existingSyncRecords = await certificateSyncDAL.findByPkiSyncId(pkiSync.id);
    const syncRecordsByCertId = new Map(
      existingSyncRecords
        .filter((record) => record.certificateId)
        .map((record) => [record.certificateId as string, record])
    );
    const certificateIds = Object.values(certificateMap)
      .map((certData) => certData.certificateId)
      .filter((id): id is string => Boolean(id));

    const flaggedForRemoval = new Set(
      existingSyncRecords
        .filter((record) => record.certificateId && hasSyncMetadataFlag(record, REMOVE_PENDING_FLAG))
        .map((record) => record.certificateId as string)
    );
    const hasReplacement = certificateIds.some((certificateId) => !flaggedForRemoval.has(certificateId));
    const removePendingCertificateIds = hasReplacement ? flaggedForRemoval : new Set<string>();
    if (flaggedForRemoval.size && !hasReplacement) {
      await certificateSyncDAL.clearSyncMetadataFlag(pkiSync.id, REMOVE_PENDING_FLAG);
    }
    const certificatesById = new Map(
      certificateIds.length
        ? (await certificateDAL.find({ $in: { id: certificateIds } })).map((certificate) => [
            certificate.id,
            certificate
          ])
        : []
    );

    const markRunFailed = async (error: unknown) => {
      const message = error instanceof Error ? error.message : "The sync did not complete.";
      await certificateSyncDAL.bulkUpdateSyncStatus(
        certificateIds.map((certificateId) => ({
          pkiSyncId: pkiSync.id,
          certificateId,
          status: CertificateSyncStatus.Failed,
          message
        }))
      );
    };

    return withClient(pkiSync, async (client, panorama, config) => {
      const [existingCertificates, profileVsysCertificates, profileCertificate] = await Promise.all([
        listCertificates(client, config),
        config.sslTlsServiceProfileVsys
          ? listCertificates(client, config, config.sslTlsServiceProfileVsys)
          : new Map<string, string | undefined>(),
        config.sslTlsServiceProfileName ? getProfileCertificate(client, config) : undefined
      ]);
      const knownCaFingerprints = new Set([...existingCertificates.values(), ...profileVsysCertificates.values()]);
      const deployPending = createDeployPendingMarker(pkiSync.id);

      const { plannedUploads, activeNames, skippedCertificates } = planUploads({
        pkiSync,
        certificateMap,
        syncRecordsByCertId,
        certificatesById,
        existingCertificates,
        removePendingCertificateIds
      });

      const imports = await importPlannedUploads({
        client,
        config,
        pkiSyncId: pkiSync.id,
        plannedUploads,
        existingCertificates,
        knownCaFingerprints,
        deployPending
      });
      let { hasDeviceChanges } = imports;

      const importedKeys = new Set(imports.succeeded.map((upload) => upload.mapKey));
      plannedUploads
        .filter((upload) => upload.replacedName && !importedKeys.has(upload.mapKey))
        .forEach((upload) => activeNames.add(upload.replacedName as string));

      const profileTarget = config.sslTlsServiceProfileName
        ? getNewestLinkedUpload(imports.succeeded, syncRecordsByCertId)
        : undefined;
      if (profileTarget && profileCertificate !== profileTarget.name) {
        await deployPending.mark();
        await client.editConfig(
          `${getProfileXpath(config)}/certificate`,
          `<certificate>${profileTarget.name}</certificate>`
        );
        hasDeviceChanges = true;
      }

      const removals = canRemoveCertificates
        ? await removeOrphanedCertificates({
            client,
            config,
            pkiSync,
            existingSyncRecords,
            existingCertificates,
            activeNames,
            deployPending
          })
        : { removedCount: 0, failedRemovals: [] };
      hasDeviceChanges ||= removals.removedCount > 0;

      await finishDeploy({
        client,
        config,
        panorama,
        pkiSyncId: pkiSync.id,
        existingSyncRecords,
        hasDeviceChanges,
        deployPending,
        description: `Infisical certificate sync: ${pkiSync.name}`
      });

      const replacedCertificateIds = [
        ...imports.succeeded.map((upload) => upload.oldCertificateIdToRemove),
        ...[...removePendingCertificateIds].filter(
          (certificateId) => !existingCertificates.has(syncRecordsByCertId.get(certificateId)?.externalIdentifier ?? "")
        )
      ].filter((id): id is string => Boolean(id));
      if (replacedCertificateIds.length) {
        await certificateSyncDAL.removeCertificates(pkiSync.id, replacedCertificateIds);
      }

      return {
        uploaded: imports.succeeded.length,
        removed: removals.removedCount || undefined,
        failedRemovals: removals.failedRemovals.length || undefined,
        skipped: skippedCertificates.length,
        details: {
          failedUploads: imports.failedUploads.length ? imports.failedUploads : undefined,
          failedRemovals: removals.failedRemovals.length ? removals.failedRemovals : undefined,
          skippedCertificates: skippedCertificates.length ? skippedCertificates : undefined
        }
      };
    }).catch(async (error: unknown) => {
      await markRunFailed(error);
      throw error;
    });
  };

  const removeCertificates = async (
    pkiSync: TPkiSyncWithCredentials,
    certificateNames: string[],
    deps?: { certificateMap?: TCertificateMap }
  ): Promise<void> => {
    const existingSyncRecords = await certificateSyncDAL.findByPkiSyncId(pkiSync.id);
    const syncRecordsByCertId = new Map(existingSyncRecords.map((record) => [record.certificateId ?? "", record]));

    const targets = certificateNames
      .map((certName) => syncRecordsByCertId.get(deps?.certificateMap?.[certName]?.certificateId ?? ""))
      .filter((record): record is TCertificateSyncs & { externalIdentifier: string; certificateId: string } =>
        Boolean(record?.externalIdentifier && record.certificateId)
      );

    if (targets.length === 0) return;

    const targetCertificateIds = new Set(targets.map((target) => target.certificateId));
    const replacementRecords = existingSyncRecords
      .filter((record) => record.certificateId && !targetCertificateIds.has(record.certificateId))
      .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));

    const ownedByOtherSync = await findNamesOwnedByOtherSyncs(
      pkiSync,
      targets.map((target) => target.externalIdentifier)
    );

    const deferredCertificateIds = await withClient(pkiSync, async (client, panorama, config) => {
      const [existingCertificates, profileCertificate] = await Promise.all([
        listCertificates(client, config),
        config.sslTlsServiceProfileName && replacementRecords.length ? getProfileCertificate(client, config) : undefined
      ]);
      const deployPending = createDeployPendingMarker(pkiSync.id);
      let hasDeviceChanges = false;
      const deferred = new Set<string>();

      if (targets.some((target) => target.externalIdentifier === profileCertificate)) {
        const replacementOnDevice = replacementRecords.find(
          (record) => record.externalIdentifier && existingCertificates.has(record.externalIdentifier)
        );
        if (replacementOnDevice) {
          await deployPending.mark();
          await client.editConfig(
            `${getProfileXpath(config)}/certificate`,
            `<certificate>${replacementOnDevice.externalIdentifier}</certificate>`
          );
          hasDeviceChanges = true;
          await certificateSyncDAL.clearSyncMetadataFlag(pkiSync.id, REMOVE_PENDING_FLAG, undefined, [
            replacementOnDevice.certificateId as string
          ]);
        } else {
          targets
            .filter((target) => target.externalIdentifier === profileCertificate)
            .forEach((target) => deferred.add(target.certificateId));
          await certificateSyncDAL.setSyncMetadataFlag(pkiSync.id, REMOVE_PENDING_FLAG, [...deferred]);
        }
      }

      for (const { externalIdentifier, certificateId } of targets) {
        if (
          deferred.has(certificateId) ||
          ownedByOtherSync.has(externalIdentifier) ||
          !existingCertificates.has(externalIdentifier)
        ) {
          // eslint-disable-next-line no-continue
          continue;
        }
        await deployPending.mark();
        try {
          await client.deleteConfig(getCertificateEntryXpath(config, externalIdentifier));
          hasDeviceChanges = true;
        } catch (error) {
          throw new PkiSyncError({
            message: `Failed to remove certificate '${externalIdentifier}' from Palo Alto Networks: ${describePanOsError(error)}`,
            shouldRetry: true
          });
        }
      }

      await finishDeploy({
        client,
        config,
        panorama,
        pkiSyncId: pkiSync.id,
        existingSyncRecords,
        hasDeviceChanges,
        deployPending,
        description: `Infisical certificate removal: ${pkiSync.name}`
      });
      return deferred;
    });

    const removedCertificateIds = [...targetCertificateIds].filter(
      (certificateId) => !deferredCertificateIds.has(certificateId)
    );
    if (removedCertificateIds.length) await certificateSyncDAL.removeCertificates(pkiSync.id, removedCertificateIds);
  };

  const testReachability = (pkiSync: TPkiSyncWithCredentials) => withClient(pkiSync, async () => undefined);

  return { syncCertificates, removeCertificates, testReachability };
};
