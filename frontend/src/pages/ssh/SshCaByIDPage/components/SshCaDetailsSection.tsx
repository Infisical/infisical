import { faCheck, faCopy, faDownload, faPencil } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import FileSaver from "file-saver";

import { ProjectPermissionCan } from "@app/components/permissions";
import { IconButton, Tooltip } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { useTimedReset } from "@app/hooks";
import { useGetSshCaById } from "@app/hooks/api";
import { caStatusToNameMap } from "@app/hooks/api/ca/constants";
import { sshCertKeyAlgorithmToNameMap } from "@app/hooks/api/sshCa/constants";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  caId: string;
  handlePopUpOpen: (popUpName: keyof UsePopUpState<["sshCa"]>, data?: object) => void;
};

export const SshCaDetailsSection = ({ caId, handlePopUpOpen }: Props) => {
  const [copyTextId, isCopyingId, setCopyTextId] = useTimedReset<string>({
    initialState: "Copy ID to clipboard"
  });
  const [downloadText, isDownloading, setDownloadText] = useTimedReset<string>({
    initialState: "Save public key"
  });

  const { data: ca } = useGetSshCaById(caId);

  const downloadTxtFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    FileSaver.saveAs(blob, filename);
  };

  return ca ? (
    <div className="border-mineshaft-600 bg-mineshaft-900 rounded-lg border p-4">
      <div className="border-mineshaft-400 flex items-center justify-between border-b pb-4">
        <h3 className="text-mineshaft-100 text-lg font-medium">SSH CA Details</h3>
        <ProjectPermissionCan
          I={ProjectPermissionActions.Edit}
          a={ProjectPermissionSub.SshCertificateAuthorities}
        >
          {(isAllowed) => {
            return (
              <Tooltip content="Edit SSH CA">
                <IconButton
                  isDisabled={!isAllowed}
                  ariaLabel="copy icon"
                  variant="plain"
                  className="group relative"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePopUpOpen("sshCa", {
                      caId: ca.id
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
          <p className="text-mineshaft-300 text-sm font-medium">SSH CA ID</p>
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
        <div className="mb-4">
          <p className="text-mineshaft-300 text-sm font-medium">Friendly Name</p>
          <p className="text-mineshaft-300 text-sm">{ca.friendlyName}</p>
        </div>
        <div className="mb-4">
          <p className="text-mineshaft-300 text-sm font-medium">Status</p>
          <p className="text-mineshaft-300 text-sm">{caStatusToNameMap[ca.status]}</p>
        </div>
        <div className="mb-4">
          <p className="text-mineshaft-300 text-sm font-medium">Key Algorithm</p>
          <p className="text-mineshaft-300 text-sm">
            {sshCertKeyAlgorithmToNameMap[ca.keyAlgorithm]}
          </p>
        </div>
        <div>
          <p className="text-mineshaft-300 text-sm font-medium">Public Key</p>
          <div className="group flex align-top">
            <p className="text-mineshaft-300 flex-1 text-sm">{ca.publicKey.substring(0, 20)}...</p>
            <div className="opacity-0 transition-opacity duration-300 group-hover:opacity-100">
              <Tooltip content={downloadText}>
                <IconButton
                  ariaLabel="copy icon"
                  variant="plain"
                  className="group relative ml-2"
                  onClick={() => {
                    setDownloadText("Saved");
                    downloadTxtFile("ssh_ca.pub", ca.publicKey);
                  }}
                >
                  <FontAwesomeIcon icon={isDownloading ? faCheck : faDownload} />
                </IconButton>
              </Tooltip>
            </div>
          </div>
        </div>
      </div>
    </div>
  ) : (
    <div />
  );
};
