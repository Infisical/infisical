import { subject } from "@casl/ability";
import { ArrowDownToLineIcon, RefreshCcwIcon } from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UnstableCard,
  UnstableCardAction,
  UnstableCardContent,
  UnstableCardDescription,
  UnstableCardHeader,
  UnstableCardTitle
} from "@app/components/v3";
import { ProjectPermissionCertificateAuthorityActions, ProjectPermissionSub } from "@app/context";
import {
  CaRenewalStatus,
  CaSigningConfigType,
  CaStatus,
  CaType,
  InternalCaType,
  useGetCa,
  useGetCaAutoRenewal,
  useGetCaSigningConfig
} from "@app/hooks/api";
import { TInternalCertificateAuthority } from "@app/hooks/api/ca/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { CaCertificatesTable } from "./CaCertificatesTable";

type Props = {
  caId: string;
  caName: string;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["renewCa", "installCaCert", "generateRootCaCert"]>,
    data?: object
  ) => void;
};

export const CaCertificatesSection = ({ caId, caName, handlePopUpOpen }: Props) => {
  const { data } = useGetCa({
    caId,
    type: CaType.INTERNAL
  });

  const ca = data as TInternalCertificateAuthority;

  const { data: signingConfig } = useGetCaSigningConfig(caId);
  const { data: autoRenewal } = useGetCaAutoRenewal(caId, {
    enabled: Boolean(caId)
  });

  const isVenafiPending = autoRenewal?.lastRenewalStatus === CaRenewalStatus.PENDING;

  const renderActionButton = () => {
    if (!ca) return null;

    if (ca.status === CaStatus.ACTIVE) {
      return (
        <ProjectPermissionCan
          I={ProjectPermissionCertificateAuthorityActions.IssueCACertificate}
          a={subject(ProjectPermissionSub.CertificateAuthorities, { name: ca.name })}
        >
          {(isAllowed) => (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  isDisabled={!isAllowed || isVenafiPending}
                  variant="project"
                  size="xs"
                  onClick={() => {
                    // Manual external CAs show the install modal with CSR for manual renewal
                    if (
                      ca.configuration.type === InternalCaType.INTERMEDIATE &&
                      !ca.configuration.parentCaId &&
                      signingConfig?.type !== CaSigningConfigType.VENAFI
                    ) {
                      handlePopUpOpen("installCaCert", {
                        caId: ca.id,
                        isParentCaExternal: true
                      });
                      return;
                    }

                    handlePopUpOpen("renewCa", {
                      caId: ca.id
                    });
                  }}
                >
                  <RefreshCcwIcon />
                  Renew CA
                </Button>
              </TooltipTrigger>
              {isVenafiPending && (
                <TooltipContent>Certificate installation is in progress</TooltipContent>
              )}
            </Tooltip>
          )}
        </ProjectPermissionCan>
      );
    }

    if (ca.status === CaStatus.PENDING_CERTIFICATE) {
      return (
        <ProjectPermissionCan
          I={ProjectPermissionCertificateAuthorityActions.Create}
          a={subject(ProjectPermissionSub.CertificateAuthorities, { name: ca.name })}
        >
          {(isAllowed) => {
            if (ca.configuration.type === InternalCaType.ROOT) {
              return (
                <Button
                  isDisabled={!isAllowed}
                  variant="project"
                  size="xs"
                  onClick={() => {
                    handlePopUpOpen("generateRootCaCert", {
                      caId: ca.id
                    });
                  }}
                >
                  Generate Certificate
                </Button>
              );
            }
            return (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    isDisabled={!isAllowed || isVenafiPending}
                    variant="project"
                    size="xs"
                    onClick={() => {
                      handlePopUpOpen("installCaCert", {
                        caId: ca.id
                      });
                    }}
                  >
                    <ArrowDownToLineIcon />
                    Install CA Certificate
                  </Button>
                </TooltipTrigger>
                {isVenafiPending && (
                  <TooltipContent>Certificate installation is in progress</TooltipContent>
                )}
              </Tooltip>
            );
          }}
        </ProjectPermissionCan>
      );
    }

    return null;
  };

  return (
    <UnstableCard className="w-full">
      <UnstableCardHeader className="border-b">
        <UnstableCardTitle>CA Certificates</UnstableCardTitle>
        <UnstableCardDescription>Issued and active certificates</UnstableCardDescription>
        <UnstableCardAction>{renderActionButton()}</UnstableCardAction>
      </UnstableCardHeader>
      <UnstableCardContent>
        <CaCertificatesTable caId={caId} caName={caName} />
      </UnstableCardContent>
    </UnstableCard>
  );
};
