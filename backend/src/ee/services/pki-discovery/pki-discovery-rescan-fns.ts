import { getProjectKmsCertificateKeyId } from "@app/services/project/project-fns";

import { describeHostFileError } from "./pki-discovery-host-fns";
import {
  buildScanRequest,
  loadKeystorePasswords,
  resolveHost,
  scanHost,
  THostScanDeps,
  toHostScanErrorMessage,
  writeHostFile
} from "./pki-discovery-host-scan-fns";
import { DB_SHORT_VARCHAR_LIMIT, truncateString } from "./pki-discovery-scan-run-fns";
import { LinuxServerTargetConfigSchema } from "./pki-discovery-schemas";
import { HostCertificateFileStatus, TLinuxServerTargetConfig, TPkiInstallationMetadata } from "./pki-discovery-types";

const recordInstallationError = async (installationId: string, message: string, deps: THostScanDeps) => {
  const installation = await deps.pkiCertificateInstallationDAL.findById(
    installationId,
    deps.pkiCertificateInstallationDAL.primaryNode()
  );
  if (!installation) return;
  const metadata = {
    ...((installation.metadata as TPkiInstallationMetadata | null) ?? {}),
    lastCheckedAt: new Date().toISOString(),
    lastError: truncateString(message, DB_SHORT_VARCHAR_LIMIT) ?? undefined
  };
  await deps.pkiCertificateInstallationDAL.updateById(installation.id, { metadata });
};

const buildFallbackTargetConfig = (connectionId: string): TLinuxServerTargetConfig => ({
  connectionIds: [connectionId],
  searchFolderPaths: [],
  ...LinuxServerTargetConfigSchema.omit({ connectionIds: true, searchFolderPaths: true }).parse({})
});

export const rescanInstallation = async (installationId: string, deps: THostScanDeps): Promise<void> => {
  const installation = await deps.pkiCertificateInstallationDAL.findById(
    installationId,
    deps.pkiCertificateInstallationDAL.primaryNode()
  );
  if (!installation) return;

  const details = installation.locationDetails as { connectionId: string; filePath: string };

  try {
    const project = await deps.projectDAL.findById(installation.projectId);
    const latestLink = await deps.pkiDiscoveryInstallationDAL.findLatestLinkByInstallationId(installationId);
    const discoveryConfig = latestLink ? await deps.pkiDiscoveryConfigDAL.findById(latestLink.discoveryId) : undefined;
    const targetConfig =
      (discoveryConfig?.targetConfig as TLinuxServerTargetConfig | undefined) ??
      buildFallbackTargetConfig(details.connectionId);

    const connection = await deps.appConnectionDAL.findById(details.connectionId);
    const host = await resolveHost(connection, project.orgId, deps);
    const keystorePasswords = await loadKeystorePasswords(installation.projectId, host, deps);

    const response = await scanHost(host, buildScanRequest(targetConfig, keystorePasswords, [details.filePath]), deps);
    const file = response.files.find((f) => f.path === details.filePath || f.realPath === details.filePath);
    if (!file) {
      await recordInstallationError(installation.id, describeHostFileError(HostCertificateFileStatus.NotFound), deps);
      return;
    }

    const certificateKmsKeyId = await getProjectKmsCertificateKeyId({
      projectId: installation.projectId,
      projectDAL: deps.projectDAL,
      kmsService: deps.kmsService
    });
    const kmsEncryptor = await deps.kmsService.encryptWithKmsKey({ kmsId: certificateKmsKeyId });

    const written = await writeHostFile(
      { ...host, hostname: response.host.hostname },
      file,
      {
        projectId: installation.projectId,
        discoveryId: discoveryConfig?.id,
        scanTime: new Date(),
        importStandaloneCaCertificates: targetConfig.importStandaloneCaCertificates,
        kmsEncryptor,
        certificateIdsByFingerprint: new Map(),
        targetInstallationId: installation.id
      },
      deps
    );
    if (!written.installationId)
      await recordInstallationError(installation.id, describeHostFileError(file.status), deps);
  } catch (error) {
    const message = toHostScanErrorMessage(error, `Installation rescan failed [installationId=${installationId}]`);
    await recordInstallationError(installation.id, message, deps);
  }
};
