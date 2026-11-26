import { Fragment } from "react";
import { subject } from "@casl/ability";
import { Link, useParams, useSearch } from "@tanstack/react-router";
import { ChevronLeftIcon, EllipsisIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { PageTitle } from "@app/components/PageTitle";
import { getCertificateDisplayName } from "@app/components/utilities/certificateDisplayUtils";
import {
  AccessRestrictedDialog,
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyHeader,
  EmptyTitle,
  PageHeader,
  PageLoader,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { ConfirmationAlertDialog } from "@app/components/v3/platform";
import { ROUTE_PATHS } from "@app/const/routes";
import {
  ProjectPermissionCertificateActions,
  ProjectPermissionPkiSyncActions,
  ProjectPermissionSub,
  useOrganization,
  useProject,
  useProjectPermission
} from "@app/context";
import {
  useDeleteCert,
  useDownloadCertPkcs12,
  useGetCertificateById,
  useUpdateRenewalConfig
} from "@app/hooks/api";
import { ApprovalPolicyType, TCertificateActionPolicyType } from "@app/hooks/api/approvalPolicies";
import { useCertificateActionApprovalData } from "@app/hooks/api/approvalRequests";
import { caSupportsCapability } from "@app/hooks/api/ca/constants";
import { CaCapability } from "@app/hooks/api/ca/enums";
import { useListCasByProjectId } from "@app/hooks/api/ca/queries";
import { CertSource, CertStatus } from "@app/hooks/api/certificates/enums";
import { useGetPkiApplicationPermissions } from "@app/hooks/api/pkiApplications/queries";
import {
  PkiApplicationResourceActions,
  PkiApplicationResourceSub
} from "@app/hooks/api/pkiApplications/types";
import { ProjectType } from "@app/hooks/api/projects/types";
import { usePopUp } from "@app/hooks/usePopUp";
import { ApplicationTab } from "@app/pages/cert-manager/ApplicationDetailsByIDPage/application-tabs";

import { BlockedActionTooltip } from "../CertificatesPage/components/BlockedActionTooltip";
import { CertificateCertModal } from "../CertificatesPage/components/CertificateCertModal";
import { CertificateDeletionSyncImpact } from "../CertificatesPage/components/CertificateDeletionSyncImpact";
import {
  CertificateExportModal,
  ExportOptions
} from "../CertificatesPage/components/CertificateExportModal";
import { CertificateManagePkiSyncsModal } from "../CertificatesPage/components/CertificateManagePkiSyncsModal";
import { CertificateManageRenewalModal } from "../CertificatesPage/components/CertificateManageRenewalModal";
import { CertificateRenewalModal } from "../CertificatesPage/components/CertificateRenewalModal";
import { CertificateRevocationModal } from "../CertificatesPage/components/CertificateRevocationModal";
import {
  canRenewOnExistingKeyPair,
  canRevokeAfterDeletion,
  CERTIFICATE_ACTION_APPROVALS,
  DELETED_CERTIFICATE_NO_ACTIONS,
  getApplicationCertificateAccess,
  getCertificateActionApproval,
  getCertificateActionMenuState,
  getCertificateDeletionTitle,
  getCertificateDeletionToast,
  getCertificateDeletionWarning,
  getPendingRequestLink,
  getRenewNowState,
  isExpiringWithinOneDay,
  isManagedCertificate
} from "../CertificatesPage/components/CertificatesTable.utils";
import { useCertificateHoldingSyncs } from "../CertificatesPage/components/useCertificateHoldingSyncs";
import {
  CertificateDetailsSection,
  CertificateInstallationsSection,
  CertificateOverviewSection
} from "./components";

const Page = () => {
  const { currentProject } = useProject();
  const { currentOrg } = useOrganization();
  const params = useParams({
    from: ROUTE_PATHS.CertManager.CertificateDetailsByIDPage.id
  });
  const { certificateId } = params as { certificateId: string };
  const { fromApplication, fromHsmConnector } = useSearch({ strict: false }) as {
    fromApplication?: string;
    fromHsmConnector?: string;
  };
  const { data: certificateData, isLoading } = useGetCertificateById(certificateId);
  const certificate = certificateData?.certificate;
  const parentApplication = certificate?.applicationName ?? fromApplication;
  const isInventoryView = !parentApplication;

  const { mutateAsync: deleteCert } = useDeleteCert();
  const { mutateAsync: downloadCertPkcs12 } = useDownloadCertPkcs12();
  const { mutateAsync: updateRenewalConfig } = useUpdateRenewalConfig();
  const { data: caData } = useListCasByProjectId();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "deleteCertificate",
    "revokeCertificate",
    "certificateCert",
    "certificateExport",
    "manageRenewal",
    "renewCertificate",
    "managePkiSyncs"
  ] as const);

  const { permission } = useProjectPermission();
  const { data: appPermissionData } = useGetPkiApplicationPermissions(
    certificate?.applicationId ?? ""
  );
  const actionApprovalData = useCertificateActionApprovalData(certificate?.applicationId);

  const { holdingSyncs, isLoadingHoldingSyncs } = useCertificateHoldingSyncs({
    certificateId: certificate?.id,
    applicationId: certificate?.applicationId,
    isEnabled: popUp.deleteCertificate.isOpen
  });

  if (isLoading) {
    return <PageLoader />;
  }

  const onDeleteCertificateSubmit = async () => {
    if (!currentProject?.id || !certificate) return;

    const response = await deleteCert({
      id: certificate.id
    });

    createNotification({
      text: getCertificateDeletionToast(response),
      type: "success"
    });

    handlePopUpClose("deleteCertificate");
  };

  const handleCertificateExport = async (
    format: "pem" | "pkcs12",
    {
      certificateId: certId,
      serialNumber
    }: {
      certificateId: string;
      serialNumber: string;
    },
    options?: ExportOptions
  ) => {
    if (format === "pem") {
      handlePopUpOpen("certificateCert", { serialNumber });
    } else if (format === "pkcs12") {
      if (!currentProject?.slug) return;

      if (!options?.pkcs12?.password || !options?.pkcs12?.alias) {
        createNotification({
          text: "Password and alias are required for PKCS12 export",
          type: "error"
        });
        return;
      }

      try {
        await downloadCertPkcs12({
          certificateId: certId,
          password: options.pkcs12.password,
          alias: options.pkcs12.alias
        });

        createNotification({
          text: "PKCS12 certificate downloaded successfully",
          type: "success"
        });
      } catch (error: unknown) {
        createNotification({
          text: error instanceof Error ? error.message : "Failed to download PKCS12 certificate",
          type: "error"
        });
      }
    }
  };

  const displayName = certificate
    ? getCertificateDisplayName(certificate, 64, "Certificate").originalDisplayName
    : "Certificate";

  const isRevoked = certificate?.status === CertStatus.REVOKED;
  const isExpired = certificate ? new Date(certificate.notAfter) < new Date() : false;
  const isExpiringWithinDay = certificate ? isExpiringWithinOneDay(certificate.notAfter) : false;
  const hasFailed = Boolean(certificate?.renewalError);
  const isAutoRenewalEnabled = Boolean(
    certificate?.renewBeforeDays && certificate.renewBeforeDays > 0
  );

  // CA capability check for revocation
  const caType = caData?.find((ca) => ca.id === certificate?.caId)?.type;
  const supportsRevocation =
    Boolean(certificate?.caId) &&
    (!caType || caSupportsCapability(caType, CaCapability.REVOKE_CERTIFICATES));

  const isDeleted = Boolean(certificate?.deletedAt);
  const isRevocableAfterDeletion = certificate
    ? canRevokeAfterDeletion(certificate, certificate.caType ?? caType)
    : true;
  const canOfferRevoke =
    supportsRevocation &&
    !isRevoked &&
    (!isDeleted || isRevocableAfterDeletion) &&
    !(isInventoryView && certificate?.applicationId);

  const handleDisableAutoRenewal = async () => {
    if (!certificate) return;

    await updateRenewalConfig({
      certificateId: certificate.id,
      enableAutoRenewal: false
    });

    createNotification({
      text: `Auto-renewal disabled for ${displayName}`,
      type: "success"
    });
  };

  const certSubject = certificate
    ? subject(ProjectPermissionSub.Certificates, {
        commonName: certificate.commonName,
        altNames: certificate.altNames?.split(",").map((s) => s.trim()),
        serialNumber: certificate.serialNumber,
        friendlyName: certificate.friendlyName,
        metadata: certificate.metadata
      })
    : null;

  const canReadCertificate = Boolean(
    certSubject &&
    (permission.can(ProjectPermissionCertificateActions.Read, certSubject) ||
      appPermissionData?.permission?.can(
        PkiApplicationResourceActions.Read,
        PkiApplicationResourceSub.Certificates
      ))
  );
  const getActionApproval = (policyType: TCertificateActionPolicyType) => {
    const { pending, policyProfileNames } = actionApprovalData[policyType];
    const pendingRequest = certificate ? pending?.get(certificate.id) : undefined;
    const approval = getCertificateActionApproval({
      policyType,
      certificate: certificate ?? {},
      pendingRequest,
      policyProfileNames
    });
    const { noun, pastParticiple } = CERTIFICATE_ACTION_APPROVALS[policyType];
    return {
      ...approval,
      noun,
      pastParticiple,
      requestLink:
        approval.isPending && pendingRequest
          ? getPendingRequestLink(currentProject, policyType, pendingRequest.id)
          : undefined
    };
  };
  const revocation = getActionApproval(ApprovalPolicyType.CertRevocation);
  const deletion = getActionApproval(ApprovalPolicyType.CertDeletion);
  const shownPendingActions = [revocation, deletion].flatMap(({ requestLink, ...action }) =>
    requestLink ? [{ ...action, requestLink }] : []
  );
  const blockingPendingActions = shownPendingActions.filter(
    ({ showsPendingNote }) => showsPendingNote
  );
  const applicationAccess = certificate?.applicationId
    ? getApplicationCertificateAccess({
        applicationName: certificate.applicationName ?? "this application",
        permission: appPermissionData?.permission,
        isRevocationApprovalRequired: revocation.isApprovalRequired,
        isDeletionApprovalRequired: deletion.isApprovalRequired
      })
    : undefined;
  const canEditCertificate = applicationAccess
    ? applicationAccess.canEdit
    : Boolean(certSubject && permission.can(ProjectPermissionCertificateActions.Edit, certSubject));
  const canRenewCertificate = applicationAccess ? applicationAccess.canRenew : canEditCertificate;
  const hasDeletePermission = applicationAccess
    ? applicationAccess.hasDeletePermission
    : Boolean(
        certSubject && permission.can(ProjectPermissionCertificateActions.Delete, certSubject)
      );
  const canDeleteCertificate = applicationAccess
    ? applicationAccess.canDelete
    : hasDeletePermission;
  const canRevokeCertificate = applicationAccess
    ? applicationAccess.canRevoke
    : hasDeletePermission;
  const canEditPkiSyncs = applicationAccess
    ? applicationAccess.canManagePkiSyncs
    : permission.can(ProjectPermissionPkiSyncActions.Edit, ProjectPermissionSub.PkiSyncs);
  const revokeMenu = getCertificateActionMenuState({
    canAct: canRevokeCertificate,
    approval: revocation,
    accessBlockedReason: applicationAccess?.revokeBlockedReason
  });
  const deleteMenu = getCertificateActionMenuState({
    canAct: canDeleteCertificate,
    approval: deletion,
    accessBlockedReason: applicationAccess?.deleteBlockedReason
  });
  const pendingActionBadges = shownPendingActions.length
    ? shownPendingActions.map(({ pendingLabel, requestLink }) => (
        <Badge key={pendingLabel} variant="warning" asChild>
          <Link {...requestLink}>{pendingLabel}</Link>
        </Badge>
      ))
    : null;

  let certificateBackLink = (
    <Link
      to="/organizations/$orgId/cert-manager/inventory"
      params={{
        orgId: currentOrg.id
      }}
    >
      <ChevronLeftIcon size={16} />
      Certificates
    </Link>
  );

  if (parentApplication) {
    certificateBackLink = (
      <Link
        to="/organizations/$orgId/cert-manager/applications/$applicationName"
        params={{
          orgId: currentOrg.id,
          applicationName: parentApplication
        }}
        search={{ selectedTab: ApplicationTab.Certificates }}
      >
        <ChevronLeftIcon size={16} />
        Go back to Application
      </Link>
    );
  } else if (fromHsmConnector) {
    certificateBackLink = (
      <Link
        to="/organizations/$orgId/cert-manager/hsm-connectors/$connectorId"
        params={{
          orgId: currentOrg.id,
          connectorId: fromHsmConnector
        }}
      >
        <ChevronLeftIcon size={16} />
        HSM Connector
      </Link>
    );
  }

  let pageBody: React.ReactNode = null;
  if (!certificate) {
    pageBody = (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyTitle>Error: Unable to find the certificate.</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  } else if (!canReadCertificate) {
    pageBody = (
      <AccessRestrictedDialog
        requirement={{
          action: ProjectPermissionCertificateActions.Read,
          subject: ProjectPermissionSub.Certificates
        }}
      />
    );
  } else {
    pageBody = (
      <div className="mx-auto mb-6 flex w-full max-w-8xl flex-col">
        <PageHeader
          backLink={certificateBackLink}
          scope={ProjectType.CertificateManager}
          description={
            blockingPendingActions.length
              ? blockingPendingActions.map(
                  ({ noun, pastParticiple, requestLink, replacesRequestReason }, index) => (
                    <Fragment key={noun}>
                      {index > 0 && " "}
                      This certificate isn&apos;t {pastParticiple} until its{" "}
                      <Link
                        {...requestLink}
                        className="text-foreground underline underline-offset-2 hover:text-project"
                      >
                        {noun} request
                      </Link>{" "}
                      is approved.
                      {replacesRequestReason && ` ${replacesRequestReason}`}
                    </Fragment>
                  )
                )
              : "View certificate details"
          }
          title={
            pendingActionBadges ? (
              // The h1 truncates as one line after its 26px scope icon (plus mr-3), so this box gets the rest
              // of the width; at max-w-full it overflows and the h1 replaces the whole title with an ellipsis.
              <span className="inline-flex max-w-[calc(100%-2.375rem)] items-center gap-x-3 align-bottom">
                <span
                  className="min-w-0 truncate underline decoration-project/90 underline-offset-4"
                  title={displayName}
                >
                  {displayName}
                </span>
                {pendingActionBadges}
              </span>
            ) : (
              displayName
            )
          }
        >
          {isDeleted && !canOfferRevoke ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button variant="outline" isDisabled>
                    Options
                    <EllipsisIcon />
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>{DELETED_CERTIFICATE_NO_ACTIONS}</TooltipContent>
            </Tooltip>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  Options
                  <EllipsisIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {!isDeleted && (
                  <DropdownMenuItem
                    isDisabled={!canReadCertificate}
                    onClick={() =>
                      handlePopUpOpen("certificateExport", {
                        certificateId: certificate.id,
                        serialNumber: certificate.serialNumber
                      })
                    }
                  >
                    Export Certificate
                  </DropdownMenuItem>
                )}
                {!isInventoryView &&
                  !isDeleted &&
                  certificate.profileId &&
                  canRenewOnExistingKeyPair(certificate) &&
                  !certificate.renewedByCertificateId &&
                  !isRevoked &&
                  !isExpired &&
                  !hasFailed &&
                  !isExpiringWithinDay && (
                    <BlockedActionTooltip reason={applicationAccess?.editBlockedReason}>
                      <DropdownMenuItem
                        isDisabled={!canEditCertificate}
                        isDisabledFocusable={Boolean(applicationAccess?.editBlockedReason)}
                        onClick={() => {
                          const notAfterDate = new Date(certificate.notAfter);
                          const notBeforeDate = certificate.notBefore
                            ? new Date(certificate.notBefore)
                            : new Date(notAfterDate.getTime() - 365 * 24 * 60 * 60 * 1000);
                          const ttlDays = Math.max(
                            1,
                            Math.ceil(
                              (notAfterDate.getTime() - notBeforeDate.getTime()) /
                                (24 * 60 * 60 * 1000)
                            )
                          );
                          handlePopUpOpen("manageRenewal", {
                            certificateId: certificate.id,
                            commonName: displayName,
                            profileId: certificate.profileId,
                            renewBeforeDays: certificate.renewBeforeDays,
                            ttlDays,
                            notAfter: certificate.notAfter,
                            renewalError: certificate.renewalError,
                            renewedFromCertificateId: certificate.renewedFromCertificateId,
                            renewedByCertificateId: certificate.renewedByCertificateId
                          });
                        }}
                      >
                        {isAutoRenewalEnabled ? "Manage Auto-Renewal" : "Enable Auto-Renewal"}
                      </DropdownMenuItem>
                    </BlockedActionTooltip>
                  )}
                {!isInventoryView &&
                  !isDeleted &&
                  certificate.profileId &&
                  canRenewOnExistingKeyPair(certificate) &&
                  !certificate.renewedByCertificateId &&
                  !isRevoked &&
                  !isExpired &&
                  !isExpiringWithinDay &&
                  isAutoRenewalEnabled && (
                    <BlockedActionTooltip reason={applicationAccess?.editBlockedReason}>
                      <DropdownMenuItem
                        isDisabled={!canEditCertificate}
                        isDisabledFocusable={Boolean(applicationAccess?.editBlockedReason)}
                        onClick={handleDisableAutoRenewal}
                      >
                        Disable Auto-Renewal
                      </DropdownMenuItem>
                    </BlockedActionTooltip>
                  )}
                {(() => {
                  const isRenewable =
                    !isInventoryView &&
                    !isDeleted &&
                    !certificate.renewedByCertificateId &&
                    !isRevoked &&
                    !isExpired;

                  if (!isRenewable) return null;

                  if (!certificate.profileId && !isManagedCertificate(certificate)) return null;

                  const renewNow = getRenewNowState({
                    certificate,
                    canRenew: canRenewCertificate,
                    permissionBlockedReason: applicationAccess?.renewBlockedReason
                  });

                  return (
                    <BlockedActionTooltip reason={renewNow.reason}>
                      <DropdownMenuItem
                        isDisabled={renewNow.isDisabled}
                        isDisabledFocusable={Boolean(renewNow.reason)}
                        onClick={() =>
                          handlePopUpOpen("renewCertificate", {
                            certificateId: certificate.id,
                            commonName: displayName,
                            canRevoke: hasDeletePermission
                          })
                        }
                      >
                        Renew Now
                      </DropdownMenuItem>
                    </BlockedActionTooltip>
                  );
                })()}
                {!isInventoryView &&
                  !isDeleted &&
                  certificate.status === CertStatus.ACTIVE &&
                  !certificate.renewedByCertificateId &&
                  certificate.source === CertSource.Issued && (
                    <BlockedActionTooltip reason={applicationAccess?.managePkiSyncsBlockedReason}>
                      <DropdownMenuItem
                        isDisabled={!canEditPkiSyncs}
                        isDisabledFocusable={Boolean(
                          applicationAccess?.managePkiSyncsBlockedReason
                        )}
                        onClick={() =>
                          handlePopUpOpen("managePkiSyncs", {
                            certificateId: certificate.id,
                            commonName: displayName
                          })
                        }
                      >
                        Manage PKI Syncs
                      </DropdownMenuItem>
                    </BlockedActionTooltip>
                  )}
                {canOfferRevoke && (
                  <BlockedActionTooltip reason={revokeMenu.reason}>
                    <DropdownMenuItem
                      isDisabled={revokeMenu.isDisabled}
                      isDisabledFocusable={revokeMenu.isDisabledFocusable}
                      onClick={() =>
                        handlePopUpOpen("revokeCertificate", {
                          certificateId: certificate.id,
                          isRevocationApprovalRequired: revocation.isApprovalRequired
                        })
                      }
                    >
                      Revoke Certificate
                    </DropdownMenuItem>
                  </BlockedActionTooltip>
                )}
                {!isDeleted && !(isInventoryView && certificate.applicationId) && (
                  <BlockedActionTooltip reason={deleteMenu.reason}>
                    <DropdownMenuItem
                      variant="danger"
                      isDisabled={deleteMenu.isDisabled}
                      isDisabledFocusable={deleteMenu.isDisabledFocusable}
                      onClick={() => handlePopUpOpen("deleteCertificate")}
                    >
                      Delete Certificate
                    </DropdownMenuItem>
                  </BlockedActionTooltip>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </PageHeader>
        <div className="flex flex-col gap-5 lg:flex-row">
          <CertificateOverviewSection
            certificateId={certificate.id}
            pendingActionBadges={pendingActionBadges}
          />
          <div className="flex min-w-0 flex-1 flex-col gap-y-5">
            <CertificateDetailsSection certificateId={certificate.id} />
            <CertificateInstallationsSection certificateId={certificate.id} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex flex-col justify-between bg-page text-foreground-inverse">
      {pageBody}
      <CertificateCertModal
        popUp={popUp}
        handlePopUpToggle={handlePopUpToggle}
        applicationId={certificate?.applicationId ?? undefined}
      />
      <CertificateExportModal
        popUp={popUp}
        handlePopUpToggle={handlePopUpToggle}
        onFormatSelected={handleCertificateExport}
      />
      <CertificateRevocationModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <CertificateManageRenewalModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <CertificateRenewalModal
        popUp={popUp}
        applicationName={parentApplication}
        handlePopUpToggle={handlePopUpToggle}
      />
      <CertificateManagePkiSyncsModal
        popUp={popUp.managePkiSyncs}
        handlePopUpToggle={handlePopUpToggle}
        applicationName={fromApplication}
      />
      <ConfirmationAlertDialog
        isOpen={popUp.deleteCertificate.isOpen}
        title={certificate ? getCertificateDeletionTitle(certificate) : "Delete Certificate?"}
        description={
          <>
            {getCertificateDeletionWarning(
              certificate,
              supportsRevocation,
              isRevocableAfterDeletion,
              deletion.isApprovalRequired
            )}
            <CertificateDeletionSyncImpact holdingSyncs={holdingSyncs} />
          </>
        }
        onOpenChange={(isOpen) => handlePopUpToggle("deleteCertificate", isOpen)}
        isPending={isLoadingHoldingSyncs}
        confirmKey="confirm"
        confirmLabel={deletion.isApprovalRequired ? "Request Deletion" : undefined}
        onConfirm={onDeleteCertificateSubmit}
      />
    </div>
  );
};

export const CertificateDetailsByIDPage = () => {
  return (
    <>
      <PageTitle title="Certificate Details" />
      <link rel="icon" href="/infisical.ico" />
      <Page />
    </>
  );
};
