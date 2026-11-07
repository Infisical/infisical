import crypto from "crypto";

import { TLicenseService } from "@app/domains/platform/license/ce/module";
import { BadRequestError } from "@app/lib/errors";

import { TOfflineUsageReportDALFactory } from "./offline-usage-report-dal";

type TOfflineUsageReportServiceFactoryDep = {
  offlineUsageReportDAL: TOfflineUsageReportDALFactory;
  license: Pick<TLicenseService, "getLicenseId" | "hasOfflineLicenseKey">;
};

export type TOfflineUsageReportServiceFactory = ReturnType<typeof offlineUsageReportServiceFactory>;

export const offlineUsageReportServiceFactory = ({
  offlineUsageReportDAL,
  license
}: TOfflineUsageReportServiceFactoryDep) => {
  const signReportContent = (content: string, licenseId: string): string => {
    const contentHash = crypto.createHash("sha256").update(content).digest("hex");
    const hmac = crypto.createHmac("sha256", licenseId);
    hmac.update(contentHash);
    return hmac.digest("hex");
  };

  const verifyReportContent = (content: string, signature: string, licenseId: string): boolean => {
    const expectedSignature = signReportContent(content, licenseId);
    return signature === expectedSignature;
  };

  const generateUsageReportCSV = async () => {
    const hasOfflineLicense = license.hasOfflineLicenseKey();

    if (!hasOfflineLicense) {
      throw new BadRequestError({
        message:
          "Offline usage reports are not enabled. Usage reports are only available for self-hosted offline instances"
      });
    }

    const licenseId = license.getLicenseId();

    const [
      userMetrics,
      machineIdentityMetrics,
      projectMetrics,
      secretMetrics,
      secretSyncMetrics,
      dynamicSecretMetrics,
      secretRotationMetrics
    ] = await Promise.all([
      offlineUsageReportDAL.getUserMetrics(),
      offlineUsageReportDAL.getMachineIdentityMetrics(),
      offlineUsageReportDAL.getProjectMetrics(),
      offlineUsageReportDAL.getSecretMetrics(),
      offlineUsageReportDAL.getSecretSyncMetrics(),
      offlineUsageReportDAL.getDynamicSecretMetrics(),
      offlineUsageReportDAL.getSecretRotationMetrics()
    ]);

    const headers = [
      "Total Users",
      "Admin Users",
      "Total Identities",
      "Total Projects",
      "Total Secrets",
      "Total Secret Syncs",
      "Total Dynamic Secrets",
      "Total Secret Rotations",
      "Avg Secrets Per Project"
    ];

    const allUserAuthMethods = Object.keys(userMetrics.usersByAuthMethod);
    allUserAuthMethods.forEach((method) => {
      headers.push(`Users Auth ${method}`);
    });

    const allIdentityAuthMethods = Object.keys(machineIdentityMetrics.machineIdentitiesByAuthMethod);
    allIdentityAuthMethods.forEach((method) => {
      headers.push(`Identities Auth ${method}`);
    });

    const allProjectTypes = Object.keys(projectMetrics.projectsByType);
    allProjectTypes.forEach((type) => {
      headers.push(`Projects ${type}`);
    });

    headers.push("Signature");

    const dataRow: (string | number)[] = [
      userMetrics.totalUsers,
      userMetrics.adminUsers,
      machineIdentityMetrics.totalMachineIdentities,
      projectMetrics.totalProjects,
      secretMetrics.totalSecrets,
      secretSyncMetrics.totalSecretSyncs,
      dynamicSecretMetrics.totalDynamicSecrets,
      secretRotationMetrics.totalSecretRotations,
      projectMetrics.averageSecretsPerProject
    ];

    allUserAuthMethods.forEach((method) => {
      dataRow.push(userMetrics.usersByAuthMethod[method] || 0);
    });
    allIdentityAuthMethods.forEach((method) => {
      dataRow.push(machineIdentityMetrics.machineIdentitiesByAuthMethod[method] || 0);
    });

    allProjectTypes.forEach((type) => {
      dataRow.push(projectMetrics.projectsByType[type] || 0);
    });

    const headersWithoutSignature = headers.slice(0, -1);
    const contentWithoutSignature = [headersWithoutSignature.join(","), dataRow.join(",")].join("\n");

    const signature = signReportContent(contentWithoutSignature, licenseId);
    dataRow.push(signature);

    const csvContent = [headers.join(","), dataRow.join(",")].join("\n");

    return {
      csvContent,
      signature,
      filename: `infisical-usage-report-${licenseId}-${new Date().toISOString().split("T")[0]}.csv`
    };
  };

  return {
    generateUsageReportCSV,
    verifyReportSignature: (csvContent: string, signature: string, licenseId: string) =>
      verifyReportContent(csvContent, signature, licenseId)
  };
};
