import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@infisical/cipher/ui/alert-dialog";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Field } from "@infisical/cipher/ui/field";
import { Inline } from "@infisical/cipher/ui/layout";
import { Select } from "@infisical/cipher/ui/select";
import { Tooltip } from "@infisical/cipher/ui/tooltip";

import { resolveCertManagerProjectId } from "@app/helpers/certManagerActiveProject";
import { caSupportsCapability } from "@app/hooks/api/ca/constants";
import { CaCapability, type CaType } from "@app/hooks/api/ca/enums";
import { crlReasons } from "@app/hooks/api/certificates/constants";
import { CertSource, CertStatus, CrlReason } from "@app/hooks/api/certificates/enums";
import { CertificateRevocationStatus, type TCertificate } from "@app/hooks/api/certificates/types";
import {
  canRevokeAfterDeletion,
  DELETED_CERTIFICATE_NO_ACTIONS,
  getCertificateDeletionWarning,
  getCertificateDisplayStatus,
  getPendingRevocationState,
  isExpiringWithinOneDay,
  isManagedCertificate,
  RENEWAL_UNAVAILABLE_NO_PROFILE
} from "@app/pages/cert-manager/CertificatesPage/components/CertificatesTable.utils";

import { failed, saved, toast } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { useV4Session } from "../../data/session/contract";
import { orgHref } from "../../links";
import { CertificateSyncImpact, useCertificateHoldingSyncs } from "./certificate-sync-impact";

export const daysLeft = (date: string) =>
  Math.round((new Date(date).getTime() - Date.now()) / 864e5);
export const shortDate = (date?: string | null) => (date ? date.slice(0, 10) : "None");

export const certificateName = (cert: TCertificate) =>
  cert.commonName || cert.altNames?.split(",")[0]?.trim() || cert.friendlyName || "Certificate";

export const altNamesOf = (cert: TCertificate) =>
  (cert.altNames || cert.subjectAltNames || "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);

const statusTone: Record<CertStatus, "ok" | "bad" | "soft" | "outline"> = {
  [CertStatus.ACTIVE]: "ok",
  [CertStatus.EXPIRED]: "bad",
  [CertStatus.REVOKED]: "bad",
  [CertStatus.RENEWED]: "soft",
  [CertStatus.DELETED]: "outline"
};

export const useRevocationApprovals = (applicationId?: string | null) => {
  const approvals = useV4Adapter("approvalRequests");
  const { data: pending } = approvals.usePendingRevocations(applicationId);
  const { data: profileNames } = approvals.useRevocationPolicyProfileNames(applicationId);
  return (cert: TCertificate) => {
    const isRevocationApprovalRequired = Boolean(
      cert.profileName && profileNames?.has(cert.profileName)
    );
    const pendingRequest = pending?.get(cert.id);
    return {
      isRevocationApprovalRequired,
      requestId: pendingRequest?.id,
      ...getPendingRevocationState({
        pendingRequest,
        isRevoked: cert.status === CertStatus.REVOKED,
        isRevocationApprovalRequired
      })
    };
  };
};

export type CertificateRevocation = ReturnType<ReturnType<typeof useRevocationApprovals>>;

export const CertificateStatusBadge = ({
  cert,
  revocation
}: {
  cert: TCertificate;
  revocation?: CertificateRevocation;
}) => {
  const { status, label } = getCertificateDisplayStatus(cert);
  const statusBadge = (
    <Badge tone={statusTone[status]} dot={status !== CertStatus.RENEWED}>
      {label}
    </Badge>
  );
  if (!revocation?.isPending) return statusBadge;
  const pendingBadge = <Badge tone="warn">Revocation pending</Badge>;
  return (
    <Inline gap={6} align="center">
      {status !== CertStatus.ACTIVE && statusBadge}
      {revocation.revokeReplacesRequestReason ? (
        <Tooltip content={revocation.revokeReplacesRequestReason}>{pendingBadge}</Tooltip>
      ) : (
        pendingBadge
      )}
    </Inline>
  );
};

export const expiresSoon = (cert: TCertificate) =>
  getCertificateDisplayStatus(cert).status === CertStatus.ACTIVE && daysLeft(cert.notAfter) <= 30;

export const ExpiryBadge = ({ cert }: { cert: TCertificate }) =>
  expiresSoon(cert) ? (
    <Badge size="sm" tone="warn">{`In ${daysLeft(cert.notAfter)} days`}</Badge>
  ) : null;

const lifecycleBlock = (cert: TCertificate, isInventoryView: boolean) => {
  if (cert.deletedAt) return DELETED_CERTIFICATE_NO_ACTIONS;
  if (cert.renewedByCertificateId) return "A newer certificate already replaced this one";
  if (cert.status === CertStatus.REVOKED) return "Revoked certificates cannot renew";
  if (new Date(cert.notAfter) < new Date()) return "Expired certificates cannot renew";
  if (isInventoryView) return "Open it from its application to renew it";
  return undefined;
};

const renewBlock = (cert: TCertificate, isInventoryView: boolean) => {
  const lifecycle = lifecycleBlock(cert, isInventoryView);
  if (lifecycle) return lifecycle;
  if (cert.profileId) return undefined;
  return isManagedCertificate(cert)
    ? RENEWAL_UNAVAILABLE_NO_PROFILE
    : "Only managed certificates renew";
};

const autoRenewBlock = (cert: TCertificate, isInventoryView: boolean) => {
  const renew = renewBlock(cert, isInventoryView);
  if (renew) return renew;
  if (cert.hasPrivateKey === false) return "Auto renewal needs the private key";
  if (isExpiringWithinOneDay(cert.notAfter)) return "Expires within a day";
  return undefined;
};

const syncBlock = (cert: TCertificate, isInventoryView: boolean) => {
  if (cert.deletedAt) return DELETED_CERTIFICATE_NO_ACTIONS;
  if (isInventoryView) return "Open it from its application to manage syncs";
  if (cert.status !== CertStatus.ACTIVE || cert.renewedByCertificateId)
    return "Only active certificates sync";
  if (cert.source !== CertSource.Issued) return "Only managed certificates sync";
  return undefined;
};

const revokeBlock = (
  cert: TCertificate,
  isInventoryView: boolean,
  caType?: CaType,
  revocation?: CertificateRevocation
) => {
  if (cert.status === CertStatus.REVOKED) return "Already revoked";
  if (revocation?.revokeBlockedReason) return revocation.revokeBlockedReason;
  if (!cert.caId || (caType && !caSupportsCapability(caType, CaCapability.REVOKE_CERTIFICATES)))
    return "Its certificate authority cannot revoke certificates";
  if (cert.deletedAt && !canRevokeAfterDeletion(cert, cert.caType ?? caType))
    return "A deleted imported certificate cannot be revoked";
  if (isInventoryView && cert.applicationId) return "Revoke it from its application";
  return undefined;
};

const deleteBlock = (cert: TCertificate, isInventoryView: boolean) => {
  if (cert.deletedAt) return DELETED_CERTIFICATE_NO_ACTIONS;
  if (isInventoryView && cert.applicationId) return "Delete it from its application";
  return undefined;
};

export const certificateBlocks = (
  cert: TCertificate,
  {
    isInventoryView,
    caType,
    revocation
  }: { isInventoryView: boolean; caType?: CaType; revocation?: CertificateRevocation }
) => ({
  export: cert.deletedAt ? DELETED_CERTIFICATE_NO_ACTIONS : undefined,
  renew: renewBlock(cert, isInventoryView),
  autoRenew: autoRenewBlock(cert, isInventoryView),
  sync: syncBlock(cert, isInventoryView),
  revoke: revokeBlock(cert, isInventoryView, caType, revocation),
  delete: deleteBlock(cert, isInventoryView)
});

export const useCertManagerProjectId = (orgId: string) => {
  const { projects } = useV4Session();
  const { data, isPending } = useV4Adapter("certificates").useInstanceState(orgId);
  const projectId = data
    ? resolveCertManagerProjectId({
        orgId,
        activeProjectId: data.activeProjectId,
        memberProjectIds: projects.map((project) => project.id)
      })
    : null;
  return { projectId, isPending };
};

export const CertManagerNotSetUp = ({ orgId }: { orgId: string }) => (
  <EmptyState
    icon="cert"
    title="Certificate Manager is not set up"
    actions={
      <Button variant="outline" asChild>
        <a href={orgHref(orgId, "/projects/cert-manager")}>Set up</a>
      </Button>
    }
  />
);

export const RevokeCertificateDialog = ({
  cert,
  isRevocationApprovalRequired = false,
  onClose
}: {
  cert?: TCertificate;
  isRevocationApprovalRequired?: boolean;
  onClose: () => void;
}) => {
  const [reason, setReason] = useState<string>(CrlReason.UNSPECIFIED);
  const revoke = useV4Adapter("certificates").useRevokeCertificate();
  return (
    <AlertDialog
      open={Boolean(cert)}
      onOpenChange={(next) => {
        if (next) return;
        onClose();
        setReason(CrlReason.UNSPECIFIED);
      }}
    >
      <AlertDialogContent tone="danger">
        <AlertDialogHeader>
          <AlertDialogTitle>{`Revoke ${cert ? certificateName(cert) : "certificate"}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            {isRevocationApprovalRequired
              ? "Submitting creates an approval request. The certificate isn't revoked until it's approved."
              : "The next CRL lists it, and clients that check revocation reject it. You cannot undo this."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Field label="Revocation reason">
          <Select
            aria-label="Revocation reason"
            options={crlReasons}
            value={reason}
            onChange={setReason}
          />
        </Field>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!cert) return;
                try {
                  const response = await revoke.mutateAsync({
                    id: cert.id,
                    revocationReason: reason
                  });
                  if (response.status === CertificateRevocationStatus.PendingApproval) {
                    toast({
                      tone: "ok",
                      title: "Revocation request submitted",
                      description: "The certificate stays active until the request is approved."
                    });
                    return;
                  }
                  if (response.crlWarning) {
                    toast({
                      tone: "neutral",
                      title: "Certificate revoked, CRL not regenerated",
                      description: response.crlWarning
                    });
                    return;
                  }
                  saved("Certificate revoked");
                } catch (error) {
                  failed("Failed to revoke certificate", error);
                }
              }}
            >
              {isRevocationApprovalRequired ? "Request revocation" : "Revoke certificate"}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export const DeleteCertificateDialog = ({
  cert,
  caType,
  projectId,
  onClose,
  onDeleted
}: {
  cert?: TCertificate;
  caType?: CaType;
  projectId: string;
  onClose: () => void;
  onDeleted?: () => void;
}) => {
  const remove = useV4Adapter("certificates").useDeleteCertificate();
  const { holdingSyncs, isLoadingHoldingSyncs } = useCertificateHoldingSyncs({
    projectId,
    certificateId: cert?.id,
    applicationId: cert?.applicationId,
    isEnabled: Boolean(cert)
  });
  const canRevoke = Boolean(
    cert?.caId && (!caType || caSupportsCapability(caType, CaCapability.REVOKE_CERTIFICATES))
  );
  return (
    <AlertDialog open={Boolean(cert)} onOpenChange={(next) => !next && onClose()}>
      <AlertDialogContent tone="danger" confirmText="confirm">
        <AlertDialogHeader>
          <AlertDialogTitle>{`Delete ${cert ? certificateName(cert) : "certificate"}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            {getCertificateDeletionWarning(
              cert,
              canRevoke,
              cert ? canRevokeAfterDeletion(cert, cert.caType ?? caType) : true
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <CertificateSyncImpact holdingSyncs={holdingSyncs} />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={isLoadingHoldingSyncs}
            onClick={async () => {
              if (!cert) return;
              try {
                await remove.mutateAsync({ id: cert.id });
              } catch (error) {
                failed("Failed to delete certificate", error);
                return;
              }
              onDeleted?.();
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
