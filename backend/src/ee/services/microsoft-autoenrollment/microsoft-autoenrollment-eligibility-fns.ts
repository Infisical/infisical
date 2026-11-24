import { TCertificateRequests } from "@app/db/schemas";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { TAppConnectionServiceFactoryDep } from "@app/services/app-connection/app-connection-service";
import {
  findDirectoryComputerBySid,
  readDirectoryComputerGroupSids,
  TLdapDirectoryGatewayServices
} from "@app/services/app-connection/ldap/ldap-directory-fns";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { CertStatus } from "@app/services/certificate/certificate-types";
import { TMicrosoftAutoenrollmentEnrollmentConfigDALFactory } from "@app/services/enrollment-config/microsoft-autoenrollment-enrollment-config-dal";
import { TPkiApplicationProfileDALFactory } from "@app/services/pki-application/pki-application-profile-dal";
import { TResourceMetadataDALFactory } from "@app/services/resource-metadata/resource-metadata-dal";

import {
  describeUnreadableUserAccountControl,
  isComputerInAllowedGroups,
  loadLdapConnectionConfig
} from "./microsoft-autoenrollment-fns";
import { MicrosoftAutoenrollmentMetadataKey } from "./microsoft-autoenrollment-types";

type TMicrosoftAutoenrollmentEligibilityDeps = {
  pkiApplicationProfileDAL: Pick<TPkiApplicationProfileDALFactory, "findOneByApplicationAndProfile" | "primaryNode">;
  microsoftAutoenrollmentEnrollmentConfigDAL: Pick<
    TMicrosoftAutoenrollmentEnrollmentConfigDALFactory,
    "findById" | "primaryNode"
  >;
  resourceMetadataDAL: Pick<TResourceMetadataDALFactory, "find">;
  certificateDAL: Pick<TCertificateDALFactory, "findById" | "primaryNode">;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
  kmsDataKeyService: TAppConnectionServiceFactoryDep["kmsDataKeyService"];
} & TLdapDirectoryGatewayServices;

const refuse = (reason: string): never => {
  throw new BadRequestError({ message: `${reason} The certificate was not issued.` });
};

const assertRenewedCertificateUsable = async (
  renewedFromCertificateId: string,
  certificateDAL: TMicrosoftAutoenrollmentEligibilityDeps["certificateDAL"]
) => {
  const renewedCertificate = await certificateDAL.findById(renewedFromCertificateId, certificateDAL.primaryNode());
  if (!renewedCertificate || renewedCertificate.deletedAt) {
    return refuse("The certificate this request renews was deleted after the request was submitted.");
  }
  if (renewedCertificate.status === CertStatus.REVOKED) {
    return refuse("The certificate this request renews was revoked after the request was submitted.");
  }
};

export const checkMicrosoftAutoenrollmentRequestBeforeSigning = async (
  certificateRequest: Pick<
    TCertificateRequests,
    "id" | "applicationId" | "profileId" | "renewedFromCertificateId" | "commonName"
  >,
  {
    pkiApplicationProfileDAL,
    microsoftAutoenrollmentEnrollmentConfigDAL,
    resourceMetadataDAL,
    certificateDAL,
    appConnectionDAL,
    kmsDataKeyService,
    gatewayV2Service,
    gatewayPoolService
  }: TMicrosoftAutoenrollmentEligibilityDeps
) => {
  const { applicationId, profileId } = certificateRequest;
  const junction =
    applicationId && profileId
      ? await pkiApplicationProfileDAL.findOneByApplicationAndProfile(
          applicationId,
          profileId,
          pkiApplicationProfileDAL.primaryNode()
        )
      : undefined;
  const config = junction?.microsoftAutoenrollmentConfigId
    ? await microsoftAutoenrollmentEnrollmentConfigDAL.findById(
        junction.microsoftAutoenrollmentConfigId,
        microsoftAutoenrollmentEnrollmentConfigDAL.primaryNode()
      )
    : undefined;
  if (!config) {
    return refuse("Microsoft Autoenrollment was turned off for this profile after the request was submitted.");
  }

  const metadata = await resourceMetadataDAL.find(
    { certificateRequestId: certificateRequest.id },
    { tx: certificateDAL.primaryNode() }
  );
  const computerSid = metadata.find((entry) => entry.key === MicrosoftAutoenrollmentMetadataKey.ComputerSid)?.value;
  if (!computerSid) {
    return refuse(
      "The request does not record which computer submitted it, so it cannot be checked in Active Directory."
    );
  }

  const gatewayServices = { gatewayV2Service, gatewayPoolService };
  const lookup = await loadLdapConnectionConfig(config.appConnectionId, { appConnectionDAL, kmsDataKeyService })
    .then(async (ldapConfig) => ({
      computer: await findDirectoryComputerBySid({ config: ldapConfig, sid: computerSid }, gatewayServices),
      groupSids: config.allowedGroups.length
        ? await readDirectoryComputerGroupSids({ config: ldapConfig, sid: computerSid }, gatewayServices)
        : []
    }))
    .catch((err: unknown) => {
      logger.warn(
        { err },
        `Unable to check a Microsoft Autoenrollment request in Active Directory before issuing [certificateRequestId=${certificateRequest.id}] [connectionId=${config.appConnectionId}]`
      );
      return null;
    });
  if (!lookup) {
    return refuse(
      "Could not look up the computer in Active Directory before issuing. Check that the directory is reachable and the profile's LDAP connection is valid."
    );
  }

  const { computer, groupSids } = lookup;
  if (!computer || !groupSids) {
    return refuse(`Computer ${computerSid} is no longer in Active Directory.`);
  }
  if (computer.isDisabled !== false) {
    return refuse(
      computer.isDisabled
        ? `Computer ${computer.samAccountName} was disabled in Active Directory after the request was submitted.`
        : describeUnreadableUserAccountControl(computer.samAccountName)
    );
  }
  if (!computer.dnsHostName) {
    return refuse(`Computer ${computer.samAccountName} no longer has a DNS host name in Active Directory.`);
  }
  if (computer.dnsHostName.toLowerCase() !== certificateRequest.commonName?.toLowerCase()) {
    return refuse(
      `Computer ${computer.samAccountName}'s DNS host name in Active Directory changed after the request was submitted, so the request no longer names it. The computer requests a new certificate on its next autoenrollment check.`
    );
  }
  if (config.allowedGroups.length && !groupSids.length) {
    return refuse(
      `The LDAP connection's account cannot read tokenGroups for computer ${computer.samAccountName}, so its group membership is unknown. Allow that account to read tokenGroups on computer objects.`
    );
  }
  if (!isComputerInAllowedGroups(config.allowedGroups, groupSids)) {
    return refuse(`Computer ${computer.samAccountName} is no longer in a group allowed to enroll for this profile.`);
  }

  if (certificateRequest.renewedFromCertificateId) {
    await assertRenewedCertificateUsable(certificateRequest.renewedFromCertificateId, certificateDAL);
  }
};
