import { faCheck, faCopy } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";

import { ProjectPermissionCan } from "@app/components/permissions";
import { Button, IconButton, Tooltip } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { useTimedReset } from "@app/hooks";
import { CaStatus, useGetCaById } from "@app/hooks/api";
import { caStatusToNameMap, caTypeToNameMap } from "@app/hooks/api/ca/constants";
import { certKeyAlgorithmToNameMap } from "@app/hooks/api/certificates/constants";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  caId: string;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["ca", "renewCa", "installCaCert"]>,
    data?: {}
  ) => void;
};

export const CaDetailsSection = ({ caId, handlePopUpOpen }: Props) => {
  const [copyTextId, isCopyingId, setCopyTextId] = useTimedReset<string>({
    initialState: "Copy ID to clipboard"
  });
  const [copyTextParentId, isCopyingParentId, setCopyTextParentId] = useTimedReset<string>({
    initialState: "Copy ID to clipboard"
  });

  const { data: ca } = useGetCaById(caId);

  return ca ? (
    <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-4">
        <h3 className="text-lg font-semibold text-mineshaft-100">CA Details</h3>
      </div>
      <div className="pt-4">
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
        {ca.parentCaId && (
          <div className="mb-4">
            <p className="text-sm font-semibold text-mineshaft-300">Parent CA ID</p>
            <div className="group flex align-top">
              <p className="text-sm text-mineshaft-300">{ca.parentCaId}</p>
              <div className="opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                <Tooltip content={copyTextParentId}>
                  <IconButton
                    ariaLabel="copy icon"
                    variant="plain"
                    className="group relative ml-2"
                    onClick={() => {
                      navigator.clipboard.writeText(ca.parentCaId as string);
                      setCopyTextParentId("Copied");
                    }}
                  >
                    <FontAwesomeIcon icon={isCopyingParentId ? faCheck : faCopy} />
                  </IconButton>
                </Tooltip>
              </div>
            </div>
          </div>
        )}
        <div className="mb-4">
          <p className="text-sm font-semibold text-mineshaft-300">Friendly Name</p>
          <p className="text-sm text-mineshaft-300">{ca.friendlyName}</p>
        </div>
        <div className="mb-4">
          <p className="text-sm font-semibold text-mineshaft-300">CA Type</p>
          <p className="text-sm text-mineshaft-300">{caTypeToNameMap[ca.type]}</p>
        </div>
        <div className="mb-4">
          <p className="text-sm font-semibold text-mineshaft-300">Status</p>
          <p className="text-sm text-mineshaft-300">{caStatusToNameMap[ca.status]}</p>
        </div>
        <div className="mb-4">
          <p className="text-sm font-semibold text-mineshaft-300">Key Algorithm</p>
          <p className="text-sm text-mineshaft-300">{certKeyAlgorithmToNameMap[ca.keyAlgorithm]}</p>
        </div>
        <div className="mb-4">
          <p className="text-sm font-semibold text-mineshaft-300">Max Path Length</p>
          <p className="text-sm text-mineshaft-300">{ca.maxPathLength ?? "-"}</p>
        </div>
        <div className="mb-4">
          <p className="text-sm font-semibold text-mineshaft-300">Not Before</p>
          <p className="text-sm text-mineshaft-300">
            {ca.notBefore ? format(new Date(ca.notBefore), "yyyy-MM-dd") : "-"}
          </p>
        </div>
        <div className="mb-4">
          <p className="text-sm font-semibold text-mineshaft-300">Not After</p>
          <p className="text-sm text-mineshaft-300">
            {ca.notAfter ? format(new Date(ca.notAfter), "yyyy-MM-dd") : "-"}
          </p>
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
                    handlePopUpOpen("renewCa", {
                      caId
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
                      caId
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
