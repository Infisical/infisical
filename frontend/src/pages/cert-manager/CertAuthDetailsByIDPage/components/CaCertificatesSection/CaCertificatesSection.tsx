import { subject } from "@casl/ability";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  UnstableCard,
  UnstableCardAction,
  UnstableCardContent,
  UnstableCardHeader,
  UnstableCardTitle
} from "@app/components/v3";
import { ProjectPermissionCertificateAuthorityActions, ProjectPermissionSub } from "@app/context";
import { CaStatus, CaType, InternalCaType, useGetCa } from "@app/hooks/api";
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

  const renderActionButton = () => {
    if (!ca) return null;

    if (ca.status === CaStatus.ACTIVE) {
      return (
        <ProjectPermissionCan
          I={ProjectPermissionCertificateAuthorityActions.IssueCACertificate}
          a={subject(ProjectPermissionSub.CertificateAuthorities, { name: ca.name })}
        >
          {(isAllowed) => (
            <Button
              isDisabled={!isAllowed}
              variant="project"
              size="xs"
              onClick={() => {
                if (
                  ca.configuration.type === InternalCaType.INTERMEDIATE &&
                  !ca.configuration.parentCaId
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
              Renew CA
            </Button>
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
              <Button
                isDisabled={!isAllowed}
                variant="project"
                size="xs"
                onClick={() => {
                  handlePopUpOpen("installCaCert", {
                    caId: ca.id
                  });
                }}
              >
                Install CA Certificate
              </Button>
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
        <UnstableCardAction>{renderActionButton()}</UnstableCardAction>
      </UnstableCardHeader>
      <UnstableCardContent>
        <CaCertificatesTable caId={caId} caName={caName} />
      </UnstableCardContent>
    </UnstableCard>
  );
};
