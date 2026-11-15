import { useState } from "react";
import { Alert } from "@infisical/cipher/ui/alert";
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
import { Stack } from "@infisical/cipher/ui/layout";
import { Loader } from "@infisical/cipher/ui/loader";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { Tabs } from "@infisical/cipher/ui/tabs";
import { TooltipProvider } from "@infisical/cipher/ui/tooltip";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";

import { PageTitle } from "@app/components/PageTitle";
import {
  SignerPermissionActions,
  SignerPermissionSub
} from "@app/context/SignerPermissionContext/types";
import { CaType } from "@app/hooks/api/ca/enums";
import { SignerStatus, type TSigner } from "@app/hooks/api/signers/types";

import { failed, saved } from "../../access/toast";
import { AccessRestricted, RESTRICTED } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";
import { orgHref, useGo, v4Path } from "../../links";
import { CODE_SIGNING_DOCS, SignerStatusBadge } from "../CodeSigningPage/signer-shared";
import { ActivityTab } from "./activity-tab";
import { ApprovalsTab } from "./approvals-tab";
import { EditSignerSheet } from "./edit-signer-sheet";
import { MembersTab } from "./members-tab";
import { DeleteSignerDialog, ExportSignerCertificateDialog } from "./signer-dialogs";

const routeId = v4Path("/organizations/$orgId/cert-manager/code-signing/$signerId/");

type Tab = "activity" | "approvals" | "members";

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
  const adapter = useV4Adapter("codeSigning");
  const { data: cas } = useV4Adapter("certificates").useCertificateAuthorities();
  const enable = adapter.useEnableSigner();
  const disable = adapter.useDisableSigner();
  const reissue = adapter.useReissueSignerCertificate();
  const checkIssuance = adapter.useCheckSignerIssuance();
  const [editing, setEditing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const tab: Tab = selectedTab ?? "activity";
  const listHref = orgHref(orgId, "/cert-manager/code-signing");
  const isDigicert = (cas ?? []).find((ca) => ca.id === signer.caId)?.type === CaType.DIGICERT;
  const blocked = (action: SignerPermissionActions) => (can(action) ? undefined : RESTRICTED);
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
    <Stack gap={24}>
      <PageHeader
        breadcrumb={[{ label: "Signers", link: go.link(listHref) }]}
        title={signer.name}
        description={signer.description || undefined}
        badges={
          <>
            <SignerStatusBadge signer={signer} />
            <DocumentationLink href={CODE_SIGNING_DOCS.signers} subject="Signers" />
          </>
        }
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button layout="trigger" variant="outline" icon="more">
                More
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() => {
                  navigator.clipboard?.writeText(signer.id).catch(() => undefined);
                  saved("Signer ID copied");
                }}
              >
                <Icon name="copy" />
                Copy signer ID
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={Boolean(exportBlocked)}
                description={exportBlocked}
                onSelect={() => setExporting(true)}
              >
                <Icon name="download" />
                Export certificate
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!can(SignerPermissionActions.Edit)}
                description={blocked(SignerPermissionActions.Edit)}
                onSelect={() => setEditing(true)}
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
              {signer.status === SignerStatus.Pending && (
                <DropdownMenuItem
                  disabled={
                    !can(SignerPermissionActions.ReissueCertificate) || checkIssuance.isPending
                  }
                  description={blocked(SignerPermissionActions.ReissueCertificate)}
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
              {signer.status === SignerStatus.Failed && signer.caId && (
                <DropdownMenuItem
                  disabled={!can(SignerPermissionActions.ReissueCertificate) || reissue.isPending}
                  description={blocked(SignerPermissionActions.ReissueCertificate)}
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
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                disabled={!can(SignerPermissionActions.Delete)}
                description={blocked(SignerPermissionActions.Delete)}
                onSelect={() => setDeleting(true)}
              >
                <Icon name="trash" />
                Delete signer
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
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
              { value: "activity", label: "Activity" },
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
      {tab === "activity" && (
        <ActivityTab
          orgId={orgId}
          signer={signer}
          canExportCertificate={can(SignerPermissionActions.ExportCertificate)}
        />
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
      <EditSignerSheet
        open={editing}
        orgId={orgId}
        signer={signer}
        onClose={() => setEditing(false)}
      />
      <ExportSignerCertificateDialog
        signer={signer}
        open={exporting}
        onClose={() => setExporting(false)}
      />
      <DeleteSignerDialog
        signer={signer}
        open={deleting}
        isDigicert={isDigicert}
        onClose={() => setDeleting(false)}
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
