import { subject } from "@casl/ability";
import { Link } from "@tanstack/react-router";
import { CheckIcon, ClipboardListIcon, ExternalLinkIcon, PencilIcon } from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import { Tooltip } from "@app/components/v2";
import {
  Badge,
  Detail,
  DetailGroup,
  DetailLabel,
  DetailValue,
  UnstableCard,
  UnstableCardAction,
  UnstableCardContent,
  UnstableCardHeader,
  UnstableCardTitle,
  UnstableIconButton
} from "@app/components/v3";
import {
  ProjectPermissionCertificateAuthorityActions,
  ProjectPermissionSub,
  useOrganization,
  useProject
} from "@app/context";
import { useTimedReset } from "@app/hooks";
import { CaStatus, CaType, InternalCaType, useGetCa } from "@app/hooks/api";
import { caStatusToNameMap, caTypeToNameMap } from "@app/hooks/api/ca/constants";
import { TInternalCertificateAuthority } from "@app/hooks/api/ca/types";
import { certKeyAlgorithmToNameMap } from "@app/hooks/api/certificates/constants";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  caId: string;
  handlePopUpOpen: (popUpName: keyof UsePopUpState<["ca"]>, data?: object) => void;
};

const getStatusVariant = (status: CaStatus) => {
  switch (status) {
    case CaStatus.ACTIVE:
      return "success";
    case CaStatus.PENDING_CERTIFICATE:
      return "warning";
    case CaStatus.DISABLED:
      return "danger";
    default:
      return "neutral";
  }
};

export const CaDetailsSection = ({ caId, handlePopUpOpen }: Props) => {
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const [, isCopyingId, setCopyTextId] = useTimedReset<string>({
    initialState: "Copy ID to clipboard"
  });

  const { data } = useGetCa({
    caId,
    type: CaType.INTERNAL
  });

  const ca = data as TInternalCertificateAuthority;

  const { data: parentCaData } = useGetCa({
    caId: ca?.configuration?.parentCaId || "",
    type: CaType.INTERNAL,
    options: {
      enabled: Boolean(ca?.configuration?.parentCaId)
    }
  });

  const parentCa = parentCaData as TInternalCertificateAuthority | undefined;

  if (!ca) {
    return <div />;
  }

  return (
    <UnstableCard className="w-full">
      <UnstableCardHeader className="border-b">
        <UnstableCardTitle>CA Details</UnstableCardTitle>
        <UnstableCardAction>
          <ProjectPermissionCan
            I={ProjectPermissionCertificateAuthorityActions.Edit}
            a={subject(ProjectPermissionSub.CertificateAuthorities, { name: ca.name })}
          >
            {(isAllowed) => (
              <Tooltip content="Edit CA">
                <UnstableIconButton
                  isDisabled={!isAllowed}
                  variant="outline"
                  size="xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePopUpOpen("ca", { caId: ca.id });
                  }}
                >
                  <PencilIcon />
                </UnstableIconButton>
              </Tooltip>
            )}
          </ProjectPermissionCan>
        </UnstableCardAction>
      </UnstableCardHeader>
      <UnstableCardContent>
        <DetailGroup>
          <Detail>
            <DetailLabel>CA Type</DetailLabel>
            <DetailValue>{caTypeToNameMap[ca.configuration.type]}</DetailValue>
          </Detail>

          <Detail>
            <DetailLabel>CA ID</DetailLabel>
            <DetailValue className="flex items-center gap-x-1">
              <span className="break-all">{ca.id}</span>
              <Tooltip content={isCopyingId ? "Copied" : "Copy ID to clipboard"}>
                <UnstableIconButton
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    navigator.clipboard.writeText(ca.id);
                    setCopyTextId("Copied");
                  }}
                >
                  {isCopyingId ? <CheckIcon /> : <ClipboardListIcon className="text-label" />}
                </UnstableIconButton>
              </Tooltip>
            </DetailValue>
          </Detail>

          {ca.configuration.type === InternalCaType.INTERMEDIATE &&
            ca.status !== CaStatus.PENDING_CERTIFICATE && (
              <Detail>
                <DetailLabel>Parent CA</DetailLabel>
                <DetailValue className="flex items-center gap-x-1">
                  {ca.configuration.parentCaId ? (
                    <Badge variant="neutral" asChild>
                      <Link
                        to="/organizations/$orgId/projects/cert-manager/$projectId/ca/$caId"
                        params={{
                          orgId: currentOrg.id,
                          projectId: currentProject.id,
                          caId: ca.configuration.parentCaId
                        }}
                      >
                        {parentCa?.name || ca.configuration.parentCaId}
                        <ExternalLinkIcon />
                      </Link>
                    </Badge>
                  ) : (
                    <span className="break-all">N/A - External Parent CA</span>
                  )}
                </DetailValue>
              </Detail>
            )}

          <Detail>
            <DetailLabel>Name</DetailLabel>
            <DetailValue>{ca.name}</DetailValue>
          </Detail>

          <Detail>
            <DetailLabel>Status</DetailLabel>
            <DetailValue>
              <Badge variant={getStatusVariant(ca.status)}>{caStatusToNameMap[ca.status]}</Badge>
            </DetailValue>
          </Detail>

          <Detail>
            <DetailLabel>Key Algorithm</DetailLabel>
            <DetailValue>{certKeyAlgorithmToNameMap[ca.configuration.keyAlgorithm]}</DetailValue>
          </Detail>
        </DetailGroup>
      </UnstableCardContent>
    </UnstableCard>
  );
};
