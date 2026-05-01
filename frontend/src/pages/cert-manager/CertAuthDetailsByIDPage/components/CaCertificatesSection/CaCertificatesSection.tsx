import { subject } from "@casl/ability";
import { ArrowDownToLineIcon, RefreshCcwIcon } from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Tooltip,
  TooltipContent,
  TooltipTrigger
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

const EXTERNAL_CA_TYPES_WITH_RENEWAL = new Set([
  CaSigningConfigType.VENAFI,
  CaSigningConfigType.AZURE_ADCS
]);

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
                      !EXTERNAL_CA_TYPES_WITH_RENEWAL.has(
                        signingConfig?.type as CaSigningConfigType
                      )
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
    <Card className="w-full">
      <CardHeader className="border-b">
        <CardTitle>CA Certificates</CardTitle>
        <CardDescription>Issued and active certificates</CardDescription>
        <CardAction>{renderActionButton()}</CardAction>
      </CardHeader>
      <CardContent>
        <CaCertificatesTable caId={caId} caName={caName} />
      </CardContent>
    </Card>
  );
};
