import { useState } from "react";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import {
  AlertTriangleIcon,
  BanIcon,
  CheckCircleIcon,
  ChevronLeftIcon,
  CopyIcon,
  DownloadIcon,
  MoreVerticalIcon,
  PencilIcon,
  PenTool,
  RefreshCwIcon,
  RotateCwIcon,
  ShieldOffIcon,
  Trash2Icon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { PageTitle } from "@app/components/PageTitle";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  Badge,
  Button,
  DocumentationLinkBadge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyHeader,
  EmptyTitle,
  PageHeader,
  PageLoader,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization } from "@app/context";
import {
  SignerPermissionActions,
  SignerPermissionSub,
  useSignerPermission
} from "@app/context/SignerPermissionContext";
import { useListCasByProjectId } from "@app/hooks/api/ca";
import { caSupportsCapability } from "@app/hooks/api/ca/constants";
import { CaCapability, CaType } from "@app/hooks/api/ca/enums";
import { CertStatus } from "@app/hooks/api/certificates/enums";
import { ProjectType } from "@app/hooks/api/projects/types";
import {
  getSignerStatusBadgeVariant,
  SignerStatus,
  signerStatusLabels,
  useCheckSignerIssuance,
  useDeleteSigner,
  useDisableSigner,
  useEnableSigner,
  useGetSigner,
  useReissueSignerCertificate,
  useRenewSignerCertificate
} from "@app/hooks/api/signers";

import { PkiDocsUrls } from "../pki-docs-urls";
import { EditSignerModal } from "./components/EditSignerModal";
import { ExportSignerCertModal } from "./components/ExportSignerCertModal";
import { RevokeSignerCertificateDialog } from "./components/RevokeSignerCertificateDialog";
import { SignerApprovalsSection } from "./components/SignerApprovalsSection";
import { SignerCertificateDetailsCard } from "./components/SignerCertificateDetailsCard";
import { SignerMembersTab } from "./components/SignerMembersTab";
import { SigningOperationsTable } from "./components/SigningOperationsTable";

type Tab = "overview" | "approvals" | "members";

export const SignerDetailPage = () => {
  const { currentOrg } = useOrganization();
  const navigate = useNavigate();

  const { signerId } = useParams({
    from: ROUTE_PATHS.CertManager.SignerDetailByIDPage.id
  });
  const { selectedTab } = useSearch({
    from: ROUTE_PATHS.CertManager.SignerDetailByIDPage.id
  });

  const activeTab: Tab = selectedTab ?? "overview";

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isRevokeOpen, setIsRevokeOpen] = useState(false);

  const { data: signer, isLoading } = useGetSigner(signerId);
  const cas = useListCasByProjectId();
  const signerCaType = (cas.data ?? []).find((ca) => ca.id === signer?.caId)?.type;
  const isDigicertSigner = signerCaType === CaType.DIGICERT;
  const { permission } = useSignerPermission();
  const can = (action: SignerPermissionActions) =>
    permission.can(action, SignerPermissionSub.Signer);
  const enableSigner = useEnableSigner();
  const disableSigner = useDisableSigner();
  const deleteSigner = useDeleteSigner();
  const reissueSigner = useReissueSignerCertificate();
  const renewSigner = useRenewSignerCertificate();
  const checkSignerIssuance = useCheckSignerIssuance();

  if (isLoading)
    return (
      <>
        <PageTitle title="Signer" />
        <PageLoader />
      </>
    );
  if (!signer)
    return (
      <>
        <PageTitle title="Signer" />
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Signer not found</EmptyTitle>
          </EmptyHeader>
        </Empty>
      </>
    );

  const onCopyId = async () => {
    await navigator.clipboard.writeText(signer.id);
    createNotification({ type: "success", text: "Signer ID copied" });
  };

  const onOpenExport = () => setIsExportOpen(true);

  const hasLiveCertificate =
    Boolean(signer.certificateId) && signer.certificateStatus !== CertStatus.REVOKED;
  const canRenewCertificate =
    hasLiveCertificate &&
    Boolean(signer.caId) &&
    signer.status !== SignerStatus.Pending &&
    signer.status !== SignerStatus.Disabled;
  const canRevokeCertificate =
    hasLiveCertificate &&
    signer.status !== SignerStatus.Pending &&
    Boolean(signerCaType) &&
    caSupportsCapability(signerCaType as CaType, CaCapability.REVOKE_CERTIFICATES);

  let statusTooltip: string | null = null;
  if (signer.status === SignerStatus.Revoked) {
    statusTooltip = "Create a new signer to keep signing.";
  } else if (signer.status === SignerStatus.Failed && signer.certificateFailureReason) {
    statusTooltip = signer.certificateFailureReason;
  } else if (signer.status === SignerStatus.Pending && signer.externalOrder) {
    statusTooltip = `DigiCert order #${signer.externalOrder.orderId} is awaiting approval. DigiCert sent an approval link to the order's approver, and issuance completes automatically once they approve it.`;
  }

  return (
    <>
      <PageTitle title={signer.name ? `Signer: ${signer.name}` : "Signer"} />
      <div className="h-full bg-page">
        <div className="mx-auto flex flex-col text-foreground-inverse">
          <div className="mx-auto mb-6 flex w-full max-w-8xl flex-col">
            <PageHeader
              backLink={
                <Link
                  to={ROUTE_PATHS.CertManager.CodeSigningPage.path}
                  params={{ orgId: currentOrg.id }}
                >
                  <ChevronLeftIcon size={16} />
                  Back to Signers
                </Link>
              }
              scope={ProjectType.CertificateManager}
              icon={PenTool}
              title={
                <span className="inline-flex items-center gap-x-2 align-middle">
                  {signer.name}
                  <DocumentationLinkBadge href={PkiDocsUrls.codeSigning.signers.overview} />
                  {statusTooltip ? (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-help">
                            <Badge variant={getSignerStatusBadgeVariant(signer.status)}>
                              {signerStatusLabels[signer.status] ?? signer.status}
                            </Badge>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[260px] text-pretty break-words">
                          {statusTooltip}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ) : (
                    <Badge variant={getSignerStatusBadgeVariant(signer.status)}>
                      {signerStatusLabels[signer.status] ?? signer.status}
                    </Badge>
                  )}
                </span>
              }
              description={signer.description ?? undefined}
            >
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="xs">
                    <MoreVerticalIcon />
                    Options
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={2}>
                  <DropdownMenuItem onClick={onCopyId}>
                    <CopyIcon />
                    Copy Signer ID
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={onOpenExport}
                    isDisabled={
                      !signer.certificateId || !can(SignerPermissionActions.ExportCertificate)
                    }
                  >
                    <DownloadIcon />
                    Export Certificate
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setIsEditOpen(true)}
                    isDisabled={!can(SignerPermissionActions.Edit)}
                  >
                    <PencilIcon />
                    Edit Settings
                  </DropdownMenuItem>
                  {/* eslint-disable-next-line no-nested-ternary */}
                  {signer.status === SignerStatus.Active ? (
                    <DropdownMenuItem
                      onClick={() => disableSigner.mutate({ signerId: signer.id })}
                      isDisabled={!can(SignerPermissionActions.ManageStatus)}
                    >
                      <BanIcon />
                      Disable Signer
                    </DropdownMenuItem>
                  ) : signer.status === SignerStatus.Disabled ? (
                    <DropdownMenuItem
                      onClick={() => enableSigner.mutate({ signerId: signer.id })}
                      isDisabled={!can(SignerPermissionActions.ManageStatus)}
                    >
                      <CheckCircleIcon />
                      Enable Signer
                    </DropdownMenuItem>
                  ) : null}
                  {signer.status === SignerStatus.Pending && (
                    <DropdownMenuItem
                      onClick={() => checkSignerIssuance.mutate(signer.id)}
                      isDisabled={
                        checkSignerIssuance.isPending ||
                        !can(SignerPermissionActions.ReissueCertificate)
                      }
                    >
                      <RefreshCwIcon />
                      Check Issuance Now
                    </DropdownMenuItem>
                  )}
                  {signer.status === SignerStatus.Failed && signer.caId && (
                    <DropdownMenuItem
                      onClick={() =>
                        reissueSigner.mutate({ signerId: signer.id, caId: signer.caId! })
                      }
                      isDisabled={!can(SignerPermissionActions.ReissueCertificate)}
                    >
                      <RotateCwIcon />
                      Retry Issuance
                    </DropdownMenuItem>
                  )}
                  {canRenewCertificate && (
                    <DropdownMenuItem
                      onClick={() => renewSigner.mutate(signer.id)}
                      isDisabled={
                        renewSigner.isPending || !can(SignerPermissionActions.ReissueCertificate)
                      }
                    >
                      <RefreshCwIcon />
                      Renew Certificate
                    </DropdownMenuItem>
                  )}
                  {canRevokeCertificate && (
                    <DropdownMenuItem
                      variant="danger"
                      onClick={() => setIsRevokeOpen(true)}
                      isDisabled={!can(SignerPermissionActions.RevokeCertificate)}
                    >
                      <ShieldOffIcon />
                      Revoke Certificate
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    variant="danger"
                    onClick={() => setIsDeleteOpen(true)}
                    isDisabled={!can(SignerPermissionActions.Delete)}
                  >
                    <Trash2Icon />
                    Delete Signer
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </PageHeader>

            <div className="flex flex-col gap-8">
              {!signer.caId && (
                <div className="mb-4 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
                  This signer has no Certificate Authority attached, so its certificate cannot be
                  auto-renewed. Once it expires, signing will stop until you create a new signer.
                </div>
              )}

              <Tabs
                value={activeTab}
                onValueChange={(v) =>
                  navigate({
                    to: ROUTE_PATHS.CertManager.SignerDetailByIDPage.path,
                    params: { orgId: currentOrg.id, signerId },
                    search: { selectedTab: v as Tab }
                  })
                }
              >
                <TabsList variant="project" aria-label="Signer sections">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="approvals">Approvals</TabsTrigger>
                  <TabsTrigger value="members">Members</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="pt-2">
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,5fr)]">
                    <SignerCertificateDetailsCard signer={signer} />
                    <SigningOperationsTable signer={signer} signerId={signerId} />
                  </div>
                </TabsContent>
                <TabsContent value="approvals" className="pt-2">
                  <SignerApprovalsSection
                    signerId={signerId}
                    canPreApprove={Boolean(
                      permission.can(SignerPermissionActions.PreApprove, SignerPermissionSub.Signer)
                    )}
                    canRequestSign={Boolean(
                      permission.can(
                        SignerPermissionActions.RequestSign,
                        SignerPermissionSub.Signer
                      )
                    )}
                  />
                </TabsContent>
                <TabsContent value="members" className="pt-2">
                  <SignerMembersTab signerId={signerId} />
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </div>
      </div>

      <EditSignerModal isOpen={isEditOpen} onOpenChange={setIsEditOpen} signer={signer} />
      <RevokeSignerCertificateDialog
        signer={signer}
        isDigicertSigner={isDigicertSigner}
        isOpen={isRevokeOpen}
        onOpenChange={setIsRevokeOpen}
      />
      <ExportSignerCertModal
        isOpen={isExportOpen}
        onOpenChange={setIsExportOpen}
        signerId={signer.id}
        signerName={signer.name}
      />
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <AlertTriangleIcon className="text-danger" />
            </AlertDialogMedia>
            <AlertDialogTitle>Delete signer &apos;{signer.name}&apos;?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the signer, its policy, members, requests, and signing
              history. The certificate is preserved for audit but signing will stop immediately.
              {isDigicertSigner && (
                <span className="mt-2 block font-medium text-warning">
                  This also revokes the certificate&apos;s DigiCert order, so the certificate can no
                  longer be used to sign anywhere.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel isDisabled={deleteSigner.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              isDisabled={deleteSigner.isPending}
              onClick={async () => {
                await deleteSigner.mutateAsync({
                  signerId: signer.id,
                  projectId: signer.projectId
                });
                navigate({
                  to: ROUTE_PATHS.CertManager.CodeSigningPage.path,
                  params: { orgId: currentOrg.id }
                });
              }}
            >
              Delete signer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
