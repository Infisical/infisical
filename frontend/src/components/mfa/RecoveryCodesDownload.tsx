import { useState } from "react";
import { faCopy, faDownload } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button, Modal, ModalContent } from "../v2";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  recoveryCodes: string[];
  onDownloadComplete: () => void;
};

export const RecoveryCodesDownload = ({
  isOpen,
  onClose,
  recoveryCodes,
  onDownloadComplete
}: Props) => {
  const [hasDownloaded, setHasDownloaded] = useState(false);
  const [copied, setCopied] = useState(false);

  const downloadRecoveryCodes = () => {
    const content = [...recoveryCodes].join("\n");

    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `infisical-recovery-codes-${new Date().toISOString().split("T")[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setHasDownloaded(true);
  };

  const copyToClipboard = async () => {
    const text = recoveryCodes.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy recovery codes:", err);
    }
  };

  const handleClose = () => {
    if (hasDownloaded) {
      onDownloadComplete();
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={hasDownloaded ? handleClose : () => {}}>
      <ModalContent title="Recovery Codes" className="max-w-md">
        <div className="space-y-4">
          <div className="border-yellow bg-yellow/10 text-yellow rounded-sm border p-2 px-3 text-xs">
            Save these codes securely. Each can only be used once.
          </div>

          <div className="border-mineshaft-600 bg-mineshaft-900 rounded-lg border p-4">
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 font-mono text-sm">
              {recoveryCodes.map((code, index) => (
                <div key={code} className="text-mineshaft-200 flex items-center">
                  <span className="text-mineshaft-400 w-8 text-right">{index + 1}.</span>
                  <span className="pl-2">{code}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              onClick={downloadRecoveryCodes}
              className="flex flex-1 items-center justify-center gap-2"
              colorSchema="primary"
              variant="solid"
            >
              <FontAwesomeIcon icon={faDownload} className="mr-2 h-4 w-4" />
              Download
            </Button>

            <Button
              onClick={copyToClipboard}
              className="flex flex-1 items-center justify-center gap-2"
              colorSchema="secondary"
              variant="outline"
            >
              <FontAwesomeIcon icon={faCopy} className="mr-2 h-4 w-4" />
              {copied ? "Copied!" : "Copy"}
            </Button>
          </div>

          {hasDownloaded ? (
            <p className="text-mineshaft-400 text-center text-xs">
              Recovery codes downloaded. You can now close this modal.
            </p>
          ) : (
            <p className="text-mineshaft-400 text-center text-xs">
              Download the recovery codes to continue.
            </p>
          )}
        </div>
      </ModalContent>
    </Modal>
  );
};
