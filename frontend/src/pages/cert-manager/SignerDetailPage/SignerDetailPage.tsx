import { useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
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
  Trash2Icon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { PageHeader } from "@app/components/v2";
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
import { useOrganization, useProject } from "@app/context";
import {
  SignerPermissionActions,
  SignerPermissionSub,
  useSignerPermission
} from "@app/context/SignerPermissionContext";
import { useListCasByProjectId } from "@app/hooks/api/ca";
import { CaType } from "@app/hooks/api/ca/enums";
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
  useReissueSignerCertificate
} from "@app/hooks/api/signers";

import { PkiDocsUrls } from "../pki-docs-urls";
import { EditSignerModal } from "./components/EditSignerModal";
import { ExportSignerCertModal } from "./components/ExportSignerCertModal";
import { SignerApprovalPolicyTab } from "./components/SignerApprovalPolicyTab";
import { SignerMembersTab } from "./components/SignerMembersTab";
import { SignerRequestsTab } from "./components/SignerRequestsTab";
import { SigningOperationsTable } from "./components/SigningOperationsTable";

type Tab = "activity" | "approvals" | "members";

export const SignerDetailPage = () => {
  const { t } = useTranslation();
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const navigate = useNavigate();

  const { signerId } = useParams({
    from: ROUTE_PATHS.CertManager.SignerDetailByIDPage.id
  });
  const { selectedTab } = useSearch({
    from: ROUTE_PATHS.CertManager.SignerDetailByIDPage.id
  });

  const activeTab: Tab = selectedTab ?? "activity";

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);

  const { data: signer, isLoading } = useGetSigner(signerId);
  const cas = useListCasByProjectId();
  const isDigicertSigner =
    (cas.data ?? []).find((ca) => ca.id === signer?.caId)?.type === CaType.DIGICERT;
  const { permission } = useSignerPermission();
  const can = (action: SignerPermissionActions) =>
    permission.can(action, SignerPermissionSub.Signer);
  const enableSigner = useEnableSigner();
  const disableSigner = useDisableSigner();
  const deleteSigner = useDeleteSigner();
  const reissueSigner = useReissueSignerCertificate();
  const checkSignerIssuance = useCheckSignerIssuance();

  if (isLoading) return <PageLoader />;
  if (!signer)
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Signer not found</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );

  const onCopyId = async () => {
    await navigator.clipboard.writeText(signer.id);
    createNotification({ type: "success", text: "Signer ID copied" });
  };

  const onOpenExport = () => setIsExportOpen(true);

  let statusTooltip: string | null = null;
  if (signer.status === SignerStatus.Failed && signer.certificateFailureReason) {
    statusTooltip = signer.certificateFailureReason;
  } else if (signer.status === SignerStatus.Pending && signer.externalOrder) {
    statusTooltip = `DigiCert order #${signer.externalOrder.orderId} is awaiting approval. DigiCert sent an approval link to the order's approver, and issuance completes automatically once they approve it.`;
  }

  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: `Signer: ${signer.name}` })}</title>
      </Helmet>
      <div className="h-full bg-bunker-800">
        <div className="mx-auto flex flex-col text-white">
          <div className="mx-auto mb-6 w-full max-w-8xl">
            <div className="mb-4">
              <Link
                to={ROUTE_PATHS.CertManager.CodeSigningPage.path}
                params={{ orgId: currentOrg.id, projectId: currentProject.id }}
                className="flex w-fit items-center gap-x-1 text-sm text-mineshaft-400 transition duration-100 hover:text-mineshaft-400/80"
              >
                <ChevronLeftIcon size={16} />
                Back to Signers
              </Link>
            </div>

            <PageHeader
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
                    Export certificate
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setIsEditOpen(true)}
                    isDisabled={!can(SignerPermissionActions.Edit)}
                  >
                    <PencilIcon />
                    Edit settings
                  </DropdownMenuItem>
                  {/* eslint-disable-next-line no-nested-ternary */}
                  {signer.status === SignerStatus.Active ? (
                    <DropdownMenuItem
                      onClick={() => disableSigner.mutate({ signerId: signer.id })}
                      isDisabled={!can(SignerPermissionActions.ManageStatus)}
                    >
                      <BanIcon />
                      Disable signer
                    </DropdownMenuItem>
                  ) : signer.status === SignerStatus.Disabled ? (
                    <DropdownMenuItem
                      onClick={() => enableSigner.mutate({ signerId: signer.id })}
                      isDisabled={!can(SignerPermissionActions.ManageStatus)}
                    >
                      <CheckCircleIcon />
                      Enable signer
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
                      Check issuance now
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
                      Retry issuance
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    variant="danger"
                    onClick={() => setIsDeleteOpen(true)}
                    isDisabled={!can(SignerPermissionActions.Delete)}
                  >
                    <Trash2Icon />
                    Delete signer
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </PageHeader>

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
                  params: { orgId: currentOrg.id, projectId: currentProject.id, signerId },
                  search: { selectedTab: v as Tab }
                })
              }
            >
              <TabsList variant="project" className="w-full justify-start">
                <TabsTrigger value="activity" className="flex-none">
                  Activity
                </TabsTrigger>
                <TabsTrigger value="approvals" className="flex-none">
                  Approvals
                </TabsTrigger>
                <TabsTrigger value="members" className="flex-none">
                  Members
                </TabsTrigger>
              </TabsList>

              <TabsContent value="activity" className="pt-2">
                <SigningOperationsTable
                  signer={signer}
                  signerId={signerId}
                  projectId={currentProject.id}
                />
              </TabsContent>
              <TabsContent value="approvals" className="pt-2">
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,5fr)]">
                  <SignerApprovalPolicyTab signerId={signerId} />
                  <SignerRequestsTab
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
                </div>
              </TabsContent>
              <TabsContent value="members" className="pt-2">
                <SignerMembersTab signerId={signerId} />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      <EditSignerModal isOpen={isEditOpen} onOpenChange={setIsEditOpen} signer={signer} />
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
                  params: { orgId: currentOrg.id, projectId: currentProject.id }
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
