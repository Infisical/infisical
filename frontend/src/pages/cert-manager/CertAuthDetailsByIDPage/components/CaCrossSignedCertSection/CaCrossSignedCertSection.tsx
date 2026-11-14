import { useMemo } from "react";
import { subject } from "@casl/ability";
import { CircleXIcon } from "lucide-react";

import {
  CrossSignedCertificatesUpgradeIntent,
  useUpgradeGate
} from "@app/components/license/UpgradeGate";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DocumentationLinkBadge,
  Loader,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  ProjectPermissionCertificateAuthorityActions,
  ProjectPermissionSub,
  useProjectPermission,
  useSubscription
} from "@app/context";
import { CaStatus, CaType, useGetCa, useGetCaCrossSignedCert } from "@app/hooks/api";
import { TInternalCertificateAuthority } from "@app/hooks/api/ca/types";
import { usePopUp } from "@app/hooks/usePopUp";

import { PkiDocsUrls } from "../../../pki-docs-urls";
import { CaCrossSignedCertActionsMenu } from "./CaCrossSignedCertActionsMenu";
import { CaCrossSignedCertCsrDialog } from "./CaCrossSignedCertCsrDialog";
import { CaCrossSignedCertDetails } from "./CaCrossSignedCertDetails";
import { CaCrossSignedCertEmptyState } from "./CaCrossSignedCertEmptyState";
import { CaCrossSignedCertImportDialog } from "./CaCrossSignedCertImportDialog";
import { CaCrossSignedCertRemoveDialog } from "./CaCrossSignedCertRemoveDialog";
import {
  ENTERPRISE_PLAN_TEXT,
  getServerErrorMessage,
  summarizeCrossSignedCert,
  TCrossSignedCertPopUp
} from "./crossSignedCertUtils";

type Props = {
  caId: string;
};

export const CaCrossSignedCertSection = ({ caId }: Props) => {
  const { permission } = useProjectPermission();
  const { subscription } = useSubscription();
  const isEntitled = Boolean(subscription.pkiCrossSignedCa);
  const { data } = useGetCa({ caId, type: CaType.INTERNAL });
  const ca = data as TInternalCertificateAuthority | undefined;
  const isCaActive = ca?.status === CaStatus.ACTIVE;

  const { data: crossSignedCert, isPending, error } = useGetCaCrossSignedCert(caId, Boolean(ca));

  const { openUpgradeGate, upgradeGate } = useUpgradeGate();
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "generateCrossSignCsr",
    "importCrossSignedCert",
    "removeCrossSignedCert"
  ] as const);

  const handleOpen = (popUpName: TCrossSignedCertPopUp) => {
    if (popUpName === "importCrossSignedCert" && !isEntitled) {
      openUpgradeGate({
        intent: CrossSignedCertificatesUpgradeIntent,
        paywallKey: "cert-manager.cross-signed-certificates"
      });
      return;
    }
    handlePopUpOpen(popUpName);
  };

  const summary = useMemo(
    () => (crossSignedCert ? summarizeCrossSignedCert(crossSignedCert) : null),
    [crossSignedCert]
  );

  if (!ca || (!isCaActive && !crossSignedCert)) return null;

  const caSubject = subject(ProjectPermissionSub.CertificateAuthorities, { name: ca.name });
  const canGenerateCsr = permission.can(
    ProjectPermissionCertificateAuthorityActions.Create,
    caSubject
  );
  const canManageCrossSignedCert =
    permission.can(ProjectPermissionCertificateAuthorityActions.IssueCACertificate, caSubject) &&
    permission.can(ProjectPermissionCertificateAuthorityActions.Edit, caSubject);

  const renderContent = () => {
    if (isPending) {
      return (
        <div className="flex h-40 w-full items-center justify-center">
          <Loader />
        </div>
      );
    }

    if (error) {
      return (
        <Alert variant="danger">
          <CircleXIcon />
          <AlertTitle>Couldn&apos;t load the cross-signed certificate</AlertTitle>
          <AlertDescription>{getServerErrorMessage(error, "Try again.")}</AlertDescription>
        </Alert>
      );
    }

    if (!crossSignedCert || !summary) {
      return (
        <CaCrossSignedCertEmptyState
          canGenerateCsr={canGenerateCsr}
          canManageCrossSignedCert={canManageCrossSignedCert}
          onOpen={handleOpen}
        />
      );
    }

    return <CaCrossSignedCertDetails crossSignedCert={crossSignedCert} summary={summary} />;
  };

  return (
    <>
      <Card className="w-full">
        <CardHeader className="border-b">
          <CardTitle>
            Cross-Signed Certificate
            <DocumentationLinkBadge href={PkiDocsUrls.ca.crossSignedCertificates} />
            {!isEntitled && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="info">Enterprise</Badge>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">{ENTERPRISE_PLAN_TEXT}</TooltipContent>
              </Tooltip>
            )}
          </CardTitle>
          <CardDescription>
            Keeps clients that trust your old CA working while you migrate
          </CardDescription>
          {crossSignedCert && (
            <CardAction>
              <CaCrossSignedCertActionsMenu
                caName={ca.name}
                crossSignedCert={crossSignedCert}
                isCaActive={isCaActive}
                canGenerateCsr={canGenerateCsr}
                canManageCrossSignedCert={canManageCrossSignedCert}
                onOpen={handleOpen}
              />
            </CardAction>
          )}
        </CardHeader>
        <CardContent>{renderContent()}</CardContent>
      </Card>
      <CaCrossSignedCertCsrDialog
        caId={ca.id}
        caName={ca.name}
        isOpen={popUp.generateCrossSignCsr.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("generateCrossSignCsr", isOpen)}
      />
      <CaCrossSignedCertImportDialog
        caId={ca.id}
        caName={ca.name}
        isReplace={Boolean(crossSignedCert)}
        currentCertificateChain={crossSignedCert?.certificateChain}
        isOpen={popUp.importCrossSignedCert.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("importCrossSignedCert", isOpen)}
      />
      <CaCrossSignedCertRemoveDialog
        caId={ca.id}
        caName={ca.name}
        trustedRootName={summary?.trustedRootName ?? ""}
        isOpen={popUp.removeCrossSignedCert.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("removeCrossSignedCert", isOpen)}
      />
      {upgradeGate}
    </>
  );
};
