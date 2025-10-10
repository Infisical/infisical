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
    <div className="border-mineshaft-600 bg-mineshaft-900 rounded-lg border p-4">
      <div className="border-mineshaft-400 flex items-center justify-between border-b pb-4">
        <h3 className="text-mineshaft-100 text-lg font-medium">CA Details</h3>
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
          <p className="text-mineshaft-300 text-sm font-medium">CA Type</p>
          <p className="text-mineshaft-300 text-sm">{caTypeToNameMap[ca.configuration.type]}</p>
        </div>
        <div className="mb-4">
          <p className="text-mineshaft-300 text-sm font-medium">CA ID</p>
          <div className="group flex align-top">
            <p className="text-mineshaft-300 text-sm">{ca.id}</p>
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
              <p className="text-mineshaft-300 text-sm font-medium">Parent CA ID</p>
              <div className="group flex align-top">
                <p className="text-mineshaft-300 text-sm">
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
          <p className="text-mineshaft-300 text-sm font-medium">Name</p>
          <p className="text-mineshaft-300 text-sm">{ca.name}</p>
        </div>
        <div className="mb-4">
          <p className="text-mineshaft-300 text-sm font-medium">Status</p>
          <p className="text-mineshaft-300 text-sm">{caStatusToNameMap[ca.status]}</p>
        </div>
        <div className="mb-4">
          <p className="text-mineshaft-300 text-sm font-medium">Key Algorithm</p>
          <p className="text-mineshaft-300 text-sm">
            {certKeyAlgorithmToNameMap[ca.configuration.keyAlgorithm]}
          </p>
        </div>
        <div className="mb-4">
          <p className="text-mineshaft-300 text-sm font-medium">Max Path Length</p>
          <p className="text-mineshaft-300 text-sm">{ca.configuration.maxPathLength ?? "-"}</p>
        </div>
        <div className="mb-4">
          <p className="text-mineshaft-300 text-sm font-medium">Not Before</p>
          <p className="text-mineshaft-300 text-sm">
            {ca.configuration.notBefore
              ? format(new Date(ca.configuration.notBefore), "yyyy-MM-dd")
              : "-"}
          </p>
        </div>
        <div className="mb-4">
          <p className="text-mineshaft-300 text-sm font-medium">Not After</p>
          <p className="text-mineshaft-300 text-sm">
            {ca.configuration.notAfter
              ? format(new Date(ca.configuration.notAfter), "yyyy-MM-dd")
              : "-"}
          </p>
        </div>
        <div className="mb-4">
          <p className="text-mineshaft-300 text-sm font-medium">Enable Direct Issuance</p>
          <p className="text-mineshaft-300 text-sm">{ca.enableDirectIssuance ? "True" : "False"}</p>
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
