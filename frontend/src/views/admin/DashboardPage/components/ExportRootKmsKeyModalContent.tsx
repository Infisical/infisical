import { useCallback, useState } from "react";

import { Button, ModalContent } from "@app/components/v2";
import { useExportServerDecryptionKey } from "@app/hooks/api";
import { useFileDownload } from "@app/hooks/useFileDownload";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["exportKey"]>, state?: boolean) => void;
};

export const ExportRootKmsKeyModalContent = ({ handlePopUpToggle }: Props) => {
  const { mutateAsync: exportKey, isLoading } = useExportServerDecryptionKey();
  const downloadFile = useFileDownload();
  const [downloaded, setDownloaded] = useState(false);

  const onExport = useCallback(async () => {
    const keyParts = await exportKey();
    downloadFile(keyParts.join("\n\n"), "infisical-encryption-key-parts.txt");
    setDownloaded(true);
  }, []);

  return (
    <ModalContent
      title="Export Root KMS Encryption Key"
      subTitle="We highly recommend exporting the KMS root encryption key and storing it in a secure location. Incase of a disaster, you can use our CLI to recover your projects with zero loss."
    >
      <div className="flex w-full justify-end">
        {!downloaded ? (
          <>
            <Button
              variant="plain"
              colorSchema="secondary"
              onClick={() => handlePopUpToggle("exportKey", false)}
            >
              Close
            </Button>

            <Button isLoading={isLoading} className="ml-2" onClick={onExport}>
              Download Key
            </Button>
          </>
        ) : (
          <div className="flex max-w-fit flex-col overflow-clip break-words px-2 text-sm font-normal text-gray-400">
            The key parts have been downloaded. Please store them in a safe place. You will need
            these keys incase you need to recovery the KMS root encryption key. Please consult our
            documentation for further instructions.
          </div>
        )}
      </div>
    </ModalContent>
  );
};
