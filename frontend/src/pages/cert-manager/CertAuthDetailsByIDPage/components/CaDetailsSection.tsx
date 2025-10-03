import { faCheck, faCopy, faPencil } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";

import { ProjectPermissionCan } from "@app/components/permissions";
import { Button, IconButton, Tooltip } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useProject } from "@app/context";
import { useTimedReset } from "@app/hooks";
import { CaStatus, CaType, InternalCaType, useGetCa } from "@app/hooks/api";
import { caStatusToNameMap, caTypeToNameMap } from "@app/hooks/api/ca/constants";
import { TInternalCertificateAuthority } from "@app/hooks/api/ca/types";
import { certKeyAlgorithmToNameMap } from "@app/hooks/api/certificates/constants";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  caName: string;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["ca", "renewCa", "installCaCert"]>,
    data?: object
  ) => void;
};

export const CaDetailsSection = ({ caName, handlePopUpOpen }: Props) => {
  const { currentProject } = useProject();
  const [copyTextId, isCopyingId, setCopyTextId] = useTimedReset<string>({
    initialState: "Copy ID to clipboard"
  });
  const [copyTextParentId, isCopyingParentId, setCopyTextParentId] = useTimedReset<string>({
    initialState: "Copy ID to clipboard"
  });

  const { data } = useGetCa({
    caName,
    projectId: currentProject.id,
    type: CaType.INTERNAL
  });

  const ca = data as TInternalCertificateAuthority;

  return ca ? (
    <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-4">
        <h3 className="text-lg font-semibold text-mineshaft-100">CA Details</h3>
        <ProjectPermissionCan I={ProjectPermissionActions.Edit} a={ProjectPermissionSub.Identity}>
          {(isAllowed) => {
            return (
              <Tooltip content="Edit CA">
                <IconButton
                  isDisabled={!isAllowed}
                  ariaLabel="copy icon"
                  variant="plain"
                  className="group relative"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePopUpOpen("ca", {
                      name: ca.name
                    });
                  }}
                >
                  <FontAwesomeIcon icon={faPencil} />
                </IconButton>
              </Tooltip>
            );
          }}
        </ProjectPermissionCan>
      </div>
      <div className="pt-4">
        <div className="mb-4">
          <p className="text-sm font-semibold text-mineshaft-300">CA Type</p>
          <p className="text-sm text-mineshaft-300">{caTypeToNameMap[ca.configuration.type]}</p>
        </div>
        <div className="mb-4">
          <p className="text-sm font-semibold text-mineshaft-300">CA ID</p>
          <div className="group flex align-top">
            <p className="text-sm text-mineshaft-300">{ca.id}</p>
            <div className="opacity-0 transition-opacity duration-300 group-hover:opacity-100">
              <Tooltip content={copyTextId}>
                <IconButton
                  ariaLabel="copy icon"
                  variant="plain"
                  className="group relative ml-2"
                  onClick={() => {
                    navigator.clipboard.writeText(ca.id);
                    setCopyTextId("Copied");
                  }}
                >
                  <FontAwesomeIcon icon={isCopyingId ? faCheck : faCopy} />
                </IconButton>
              </Tooltip>
            </div>
          </div>
        </div>
        {ca.configuration.type === InternalCaType.INTERMEDIATE &&
          ca.status !== CaStatus.PENDING_CERTIFICATE && (
            <div className="mb-4">
              <p className="text-sm font-semibold text-mineshaft-300">Parent CA ID</p>
              <div className="group flex align-top">
                <p className="text-sm text-mineshaft-300">
                  {ca.configuration.parentCaId
                    ? ca.configuration.parentCaId
                    : "N/A - External Parent CA"}
                </p>
                {ca.configuration.parentCaId && (
                  <div className="opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                    <Tooltip content={copyTextParentId}>
                      <IconButton
                        ariaLabel="copy icon"
                        variant="plain"
                        className="group relative ml-2"
                        onClick={() => {
                          navigator.clipboard.writeText(ca.configuration.parentCaId as string);
                          setCopyTextParentId("Copied");
                        }}
                      >
                        <FontAwesomeIcon icon={isCopyingParentId ? faCheck : faCopy} />
                      </IconButton>
                    </Tooltip>
                  </div>
                )}
              </div>
            </div>
          )}
        <div className="mb-4">
          <p className="text-sm font-semibold text-mineshaft-300">Name</p>
          <p className="text-sm text-mineshaft-300">{ca.name}</p>
        </div>
        <div className="mb-4">
          <p className="text-sm font-semibold text-mineshaft-300">Status</p>
          <p className="text-sm text-mineshaft-300">{caStatusToNameMap[ca.status]}</p>
        </div>
        <div className="mb-4">
          <p className="text-sm font-semibold text-mineshaft-300">Key Algorithm</p>
          <p className="text-sm text-mineshaft-300">
            {certKeyAlgorithmToNameMap[ca.configuration.keyAlgorithm]}
          </p>
        </div>
        <div className="mb-4">
          <p className="text-sm font-semibold text-mineshaft-300">Max Path Length</p>
          <p className="text-sm text-mineshaft-300">{ca.configuration.maxPathLength ?? "-"}</p>
        </div>
        <div className="mb-4">
          <p className="text-sm font-semibold text-mineshaft-300">Not Before</p>
          <p className="text-sm text-mineshaft-300">
            {ca.configuration.notBefore
              ? format(new Date(ca.configuration.notBefore), "yyyy-MM-dd")
              : "-"}
          </p>
        </div>
        <div className="mb-4">
          <p className="text-sm font-semibold text-mineshaft-300">Not After</p>
          <p className="text-sm text-mineshaft-300">
            {ca.configuration.notAfter
              ? format(new Date(ca.configuration.notAfter), "yyyy-MM-dd")
              : "-"}
          </p>
        </div>
        <div className="mb-4">
          <p className="text-sm font-semibold text-mineshaft-300">Enable Direct Issuance</p>
          <p className="text-sm text-mineshaft-300">{ca.enableDirectIssuance ? "True" : "False"}</p>
        </div>
        {ca.status === CaStatus.ACTIVE && (
          <ProjectPermissionCan
            I={ProjectPermissionActions.Edit}
            a={ProjectPermissionSub.CertificateAuthorities}
          >
            {(isAllowed) => {
              return (
                <Button
                  isDisabled={!isAllowed}
                  className="mt-4 w-full"
                  colorSchema="primary"
                  type="submit"
                  onClick={() => {
                    if (
                      ca.configuration.type === InternalCaType.INTERMEDIATE &&
                      !ca.configuration.parentCaId
                    ) {
                      // intermediate CA with external parent CA
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
              );
            }}
          </ProjectPermissionCan>
        )}
        {ca.status === CaStatus.PENDING_CERTIFICATE && (
          <ProjectPermissionCan
            I={ProjectPermissionActions.Create}
            a={ProjectPermissionSub.CertificateAuthorities}
          >
            {(isAllowed) => {
              return (
                <Button
                  isDisabled={!isAllowed}
                  className="mt-4 w-full"
                  colorSchema="primary"
                  type="submit"
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
        )}
      </div>
    </div>
  ) : (
    <div />
  );
};
