import { useState } from "react";
import { Alert } from "@infisical/cipher/ui/alert";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { DocumentationLink } from "@infisical/cipher/ui/documentation-link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { DetailLayout, Stack } from "@infisical/cipher/ui/layout";
import { Loader } from "@infisical/cipher/ui/loader";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { Tabs } from "@infisical/cipher/ui/tabs";
import { Tooltip, TooltipProvider } from "@infisical/cipher/ui/tooltip";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";

import { PageTitle } from "@app/components/PageTitle";
import {
  SignerPermissionActions,
  SignerPermissionSub
} from "@app/context/SignerPermissionContext/types";
import { caSupportsCapability } from "@app/hooks/api/ca/constants";
import { CaCapability } from "@app/hooks/api/ca/enums";
import { CertStatus } from "@app/hooks/api/certificates/enums";
import {
  getOpenCertificateRequest,
  getPendingRevocationRequestId,
  getSignerRevocationNote,
  hasFailedRenewal,
  SignerStatus,
  type TSigner
} from "@app/hooks/api/signers/types";

import { failed, saved } from "../../access/toast";
import { AccessRestricted, RESTRICTED } from "../../access/ui";
import { copyText } from "../../clipboard";
import { useV4Adapter } from "../../data/adapters";
import { orgHref, useGo, v4Path } from "../../links";
import { CODE_SIGNING_DOCS, SignerStatusBadge } from "../CodeSigningPage/signer-shared";
import { ActivityTab } from "./activity-tab";
import { ApprovalsTab } from "./approvals-tab";
import { SignerCertificateCard } from "./certificate-card";
import { EditSignerSheet } from "./edit-signer-sheet";
import { MembersTab } from "./members-tab";
import {
  DeleteSignerDialog,
  ExportSignerCertificateDialog,
  ReissueSignerCertificateDialog,
  RenewSignerCertificateDialog,
  RevokeSignerCertificateDialog
} from "./signer-dialogs";

const routeId = v4Path("/organizations/$orgId/cert-manager/code-signing/$signerId/");

type Tab = "overview" | "approvals" | "members";

const statusNote = (signer: TSigner) => {
  const revocationNote = getSignerRevocationNote(signer);
  if (revocationNote) return revocationNote;
  if (signer.status === SignerStatus.Failed && signer.certificateFailureReason)
    return signer.certificateFailureReason;
  const pendingOrder = getOpenCertificateRequest(signer)?.externalOrder;
  if (signer.status === SignerStatus.Pending && pendingOrder)
    return `DigiCert order #${pendingOrder.orderId} is waiting for approval. DigiCert emailed the order's approver a link, and the certificate is issued as soon as they approve it.`;
  return null;
};

const renewalNote = (signer: TSigner) => {
  const openRequest = getOpenCertificateRequest(signer);
  if (
    !openRequest ||
    signer.status === SignerStatus.Pending ||
    signer.status === SignerStatus.RevocationPending ||
    signer.status === SignerStatus.Revoked
  )
    return null;
  const keepsSigning =
    signer.status === SignerStatus.Active
      ? " The signer keeps signing with its current certificate until then."
      : "";
  return openRequest.externalOrder
    ? `DigiCert order #${openRequest.externalOrder.orderId} is waiting for approval.${keepsSigning}`
    : `A new certificate is being issued.${keepsSigning}`;
};

const certificateActions = (signer: TSigner) => {
  const hasLiveCertificate =
    Boolean(signer.certificateId) && signer.certificateStatus !== CertStatus.REVOKED;
  const hasPendingCertificateRequest =
    signer.status === SignerStatus.Pending || Boolean(getOpenCertificateRequest(signer));
  const isRevoking =
    signer.status === SignerStatus.RevocationPending || signer.status === SignerStatus.Revoked;
  return {
    hasPendingCertificateRequest,
    canRetry: signer.status === SignerStatus.Failed && Boolean(signer.caId),
    canReissueRevoked: signer.status === SignerStatus.Revoked && Boolean(signer.caId),
    canRenew:
      hasLiveCertificate &&
      Boolean(signer.caId) &&
      !hasPendingCertificateRequest &&
      signer.status !== SignerStatus.Disabled &&
      !isRevoking,
    canRevoke:
      (hasLiveCertificate || signer.status === SignerStatus.RevocationPending) &&
      !getPendingRevocationRequestId(signer) &&
      Boolean(signer.caType) &&
      caSupportsCapability(signer.caType!, CaCapability.REVOKE_CERTIFICATES)
  };
};

type SignerDialog = "edit" | "export" | "delete" | "renew" | "reissue" | "revoke";

const SignerBadges = ({ signer }: { signer: TSigner }) => {
  const renewal = renewalNote(signer);
  return (
    <>
      <SignerStatusBadge signer={signer} note={statusNote(signer)} />
      {renewal && (
        <Tooltip content={renewal}>
          <Badge tone="info" icon="clock">
            Renewal in progress
          </Badge>
        </Tooltip>
      )}
      {hasFailedRenewal(signer) && (
        <Tooltip
          content={`${(signer.certificateFailureReason ?? "").replace(/\.$/, "")}. The signer still has its current certificate.`}
        >
          <Badge tone="warn" icon="alert">
            Request failed
          </Badge>
        </Tooltip>
      )}
      <DocumentationLink href={CODE_SIGNING_DOCS.signers} subject="Signers" />
    </>
  );
};

const SignerActionsMenu = ({
  signer,
  can,
  onOpen
}: {
  signer: TSigner;
  can: (action: SignerPermissionActions) => boolean;
  onOpen: (dialog: SignerDialog) => void;
}) => {
  const adapter = useV4Adapter("codeSigning");
  const enable = adapter.useEnableSigner();
  const disable = adapter.useDisableSigner();
  const reissue = adapter.useReissueSignerCertificate();
  const checkIssuance = adapter.useCheckSignerIssuance();
  const actions = certificateActions(signer);
  const blocked = (action: SignerPermissionActions) => (can(action) ? undefined : RESTRICTED);
  const reissueBlocked = blocked(SignerPermissionActions.ReissueCertificate);
  const exportBlocked = signer.certificateId
    ? blocked(SignerPermissionActions.ExportCertificate)
    : "This signer has no certificate yet";
  const statusBlocked =
    blocked(SignerPermissionActions.ManageStatus) ??
    (enable.isPending || disable.isPending ? "Updating the signer status" : undefined);

  const run = async (action: () => Promise<unknown>, failure: string) => {
    try {
      await action();
    } catch (error) {
      failed(failure, error);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button layout="trigger" variant="outline" icon="more">
          More
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onSelect={async () => {
            if (await copyText(signer.id)) saved("Signer ID copied");
          }}
        >
          <Icon name="copy" />
          Copy signer ID
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={Boolean(exportBlocked)}
          description={exportBlocked}
          onSelect={() => onOpen("export")}
        >
          <Icon name="download" />
          Export certificate
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!can(SignerPermissionActions.Edit)}
          description={blocked(SignerPermissionActions.Edit)}
          onSelect={() => onOpen("edit")}
        >
          <Icon name="pencil" />
          Edit settings
        </DropdownMenuItem>
        {signer.status === SignerStatus.Active && (
          <DropdownMenuItem
            disabled={Boolean(statusBlocked)}
            description={statusBlocked}
            onSelect={() =>
              run(
                () => disable.mutateAsync({ signerId: signer.id }),
                `Couldn't disable ${signer.name}`
              )
            }
          >
            <Icon name="pause" />
            Disable signer
          </DropdownMenuItem>
        )}
        {signer.status === SignerStatus.Disabled && (
          <DropdownMenuItem
            disabled={Boolean(statusBlocked)}
            description={statusBlocked}
            onSelect={() =>
              run(
                () => enable.mutateAsync({ signerId: signer.id }),
                `Couldn't enable ${signer.name}`
              )
            }
          >
            <Icon name="check" />
            Enable signer
          </DropdownMenuItem>
        )}
        {actions.hasPendingCertificateRequest && (
          <DropdownMenuItem
            disabled={Boolean(reissueBlocked) || checkIssuance.isPending}
            description={reissueBlocked}
            onSelect={() =>
              run(
                () => checkIssuance.mutateAsync(signer.id),
                `Couldn't check issuance for ${signer.name}`
              )
            }
          >
            <Icon name="sync" />
            Check issuance now
          </DropdownMenuItem>
        )}
        {actions.canRetry && (
          <DropdownMenuItem
            disabled={Boolean(reissueBlocked) || reissue.isPending}
            description={reissueBlocked}
            onSelect={() =>
              run(
                () => reissue.mutateAsync({ signerId: signer.id, caId: signer.caId! }),
                `Couldn't retry issuance for ${signer.name}`
              )
            }
          >
            <Icon name="sync" />
            Retry issuance
          </DropdownMenuItem>
        )}
        {actions.canReissueRevoked && (
          <DropdownMenuItem
            disabled={Boolean(reissueBlocked) || reissue.isPending}
            description={reissueBlocked}
            onSelect={() => onOpen("reissue")}
          >
            <Icon name="sync" />
            Reissue certificate
          </DropdownMenuItem>
        )}
        {actions.canRenew && (
          <DropdownMenuItem
            disabled={Boolean(reissueBlocked)}
            description={reissueBlocked}
            onSelect={() => onOpen("renew")}
          >
            <Icon name="sync" />
            Renew certificate
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        {actions.canRevoke && (
          <DropdownMenuItem
            variant="destructive"
            disabled={!can(SignerPermissionActions.RevokeCertificate)}
            description={blocked(SignerPermissionActions.RevokeCertificate)}
            onSelect={() => onOpen("revoke")}
          >
            <Icon name="shield" />
            Revoke certificate
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          variant="destructive"
          disabled={!can(SignerPermissionActions.Delete)}
          description={blocked(SignerPermissionActions.Delete)}
          onSelect={() => onOpen("delete")}
        >
          <Icon name="trash" />
          Delete signer
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const SignerDetail = ({
  orgId,
  signer,
  can
}: {
  orgId: string;
  signer: TSigner;
  can: (action: SignerPermissionActions) => boolean;
}) => {
  const go = useGo();
  const navigate = useNavigate();
  const { selectedTab } = useSearch({ from: routeId });
  const [dialog, setDialog] = useState<SignerDialog | null>(null);
  const close = () => setDialog(null);
  const tab: Tab = selectedTab ?? "overview";
  const listHref = orgHref(orgId, "/cert-manager/code-signing");

  return (
    <Stack gap={24}>
      <PageHeader
        breadcrumb={[{ label: "Signers", link: go.link(listHref) }]}
        title={signer.name}
        description={signer.description || undefined}
        badges={<SignerBadges signer={signer} />}
        actions={<SignerActionsMenu signer={signer} can={can} onOpen={setDialog} />}
        tabs={
          <Tabs
            label="Signer sections"
            value={tab}
            onValueChange={(next) =>
              navigate({
                to: v4Path("/organizations/$orgId/cert-manager/code-signing/$signerId"),
                params: { orgId, signerId: signer.id },
                search: { selectedTab: next as Tab }
              })
            }
            tabs={[
              { value: "overview", label: "Overview" },
              { value: "approvals", label: "Approvals" },
              { value: "members", label: "Members" }
            ]}
          />
        }
      />
      {!signer.caId && (
        <Alert tone="warn">
          This signer has no certificate authority, so its certificate can&apos;t renew
          automatically. Once it expires, signing stops until you create a new signer.
        </Alert>
      )}
      {tab === "overview" && (
        <DetailLayout
          asideLabel="Certificate details"
          aside={<SignerCertificateCard orgId={orgId} signer={signer} />}
        >
          <ActivityTab
            orgId={orgId}
            signer={signer}
            canExportCertificate={can(SignerPermissionActions.ExportCertificate)}
          />
        </DetailLayout>
      )}
      {tab === "approvals" && (
        <ApprovalsTab
          orgId={orgId}
          signerId={signer.id}
          canManagePolicy={can(SignerPermissionActions.ManagePolicy)}
          canPreApprove={can(SignerPermissionActions.PreApprove)}
          canRequestSign={can(SignerPermissionActions.RequestSign)}
        />
      )}
      {tab === "members" && (
        <MembersTab
          orgId={orgId}
          projectId={signer.projectId}
          signerId={signer.id}
          canManageMembers={can(SignerPermissionActions.ManageMembers)}
        />
      )}
      <EditSignerSheet open={dialog === "edit"} orgId={orgId} signer={signer} onClose={close} />
      <ExportSignerCertificateDialog signer={signer} open={dialog === "export"} onClose={close} />
      <RenewSignerCertificateDialog signer={signer} open={dialog === "renew"} onClose={close} />
      <ReissueSignerCertificateDialog signer={signer} open={dialog === "reissue"} onClose={close} />
      <RevokeSignerCertificateDialog signer={signer} open={dialog === "revoke"} onClose={close} />
      <DeleteSignerDialog
        signer={signer}
        open={dialog === "delete"}
        onClose={close}
        onDeleted={() => go(listHref)}
      />
    </Stack>
  );
};

const Page = () => {
  const { orgId, signerId } = useParams({ from: routeId });
  const adapter = useV4Adapter("codeSigning");
  const { data: signer, isPending } = adapter.useSigner(signerId);
  const { data: access, isPending: isLoadingAccess } = adapter.useSignerPermission(signerId);
  if (isPending || (signer && isLoadingAccess))
    return <Loader size="page" label="Loading signer" />;
  if (!signer)
    return (
      <EmptyState
        icon="cert"
        title="Signer not found"
        description="It may have been deleted, or you may not have access to it."
        actions={
          <Button variant="outline" asChild>
            <a href={orgHref(orgId, "/cert-manager/code-signing")}>Back to signers</a>
          </Button>
        }
      />
    );
  const can = (action: SignerPermissionActions) =>
    Boolean(access?.permission.can(action, SignerPermissionSub.Signer));
  if (!can(SignerPermissionActions.Read))
    return <AccessRestricted requirement="Read this signer" />;
  return <SignerDetail orgId={orgId} signer={signer} can={can} />;
};

export const SignerDetailPage = () => {
  const { signerId } = useParams({ from: routeId });
  const { data: signer } = useV4Adapter("codeSigning").useSigner(signerId);
  return (
    <TooltipProvider>
      <PageTitle title={signer?.name ? `Signer: ${signer.name}` : "Signer"} />
      <Page />
    </TooltipProvider>
  );
};
