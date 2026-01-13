import { faCheck, faCopy, faDownload } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import FileSaver from "file-saver";

import { IconButton, Modal, ModalContent, Spinner, Tooltip } from "@app/components/v2";
import {
  ProjectPermissionCmekActions,
  ProjectPermissionSub,
  useProjectPermission
} from "@app/context";
import { useTimedReset } from "@app/hooks";
import { useGetCmekPrivateKey, useGetCmekPublicKey } from "@app/hooks/api/cmeks/queries";
import { AsymmetricKeyAlgorithm, TCmek } from "@app/hooks/api/cmeks/types";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  cmek: TCmek;
};

type FormProps = Pick<Props, "cmek">;

const ExportKeyForm = ({ cmek }: FormProps) => {
  const { permission } = useProjectPermission();
  const isAsymmetricKey = Object.values(AsymmetricKeyAlgorithm).includes(
    cmek?.encryptionAlgorithm as AsymmetricKeyAlgorithm
  );

  const canReadPublicKey = permission.can(
    ProjectPermissionCmekActions.Read,
    ProjectPermissionSub.Cmek
  );

  const canExportPrivateKey = permission.can(
    ProjectPermissionCmekActions.ExportPrivateKey,
    ProjectPermissionSub.Cmek
  );

  const { data: privateKeyData, isPending: isPrivateKeyPending } = useGetCmekPrivateKey(
    cmek?.id ?? "",
    {
      // Only fetch private key if user has ExportPrivateKey permission
      enabled: Boolean(cmek?.id) && canExportPrivateKey
    }
  );

  const { data: publicKeyData, isPending: isPublicKeyPending } = useGetCmekPublicKey(
    cmek?.id ?? "",
    {
      // Only fetch public key if user has Read permission and it's an asymmetric key
      enabled: Boolean(cmek?.id) && isAsymmetricKey && canReadPublicKey
    }
  );

  const [copyPrivateKeyText, isCopyingPrivateKey, setCopyPrivateKeyText] = useTimedReset<string>({
    initialState: "Copy to clipboard"
  });

  const [copyPublicKeyText, isCopyingPublicKey, setCopyPublicKeyText] = useTimedReset<string>({
    initialState: "Copy to clipboard"
  });

  const downloadTxtFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    FileSaver.saveAs(blob, filename);
  };

  const isLoading =
    (canExportPrivateKey && isPrivateKeyPending) ||
    (isAsymmetricKey && canReadPublicKey && isPublicKeyPending);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div>
      {canExportPrivateKey && privateKeyData?.privateKey && (
        <>
          <div className="mb-4 flex items-center justify-between">
            <h2>{isAsymmetricKey ? "Private Key (Base64)" : "Key Material (Base64)"}</h2>
            <div className="flex">
              <Tooltip content={copyPrivateKeyText}>
                <IconButton
                  ariaLabel="copy icon"
                  colorSchema="secondary"
                  className="group relative"
                  onClick={() => {
                    navigator.clipboard.writeText(privateKeyData?.privateKey ?? "");
                    setCopyPrivateKeyText("Copied");
                  }}
                >
                  <FontAwesomeIcon icon={isCopyingPrivateKey ? faCheck : faCopy} />
                </IconButton>
              </Tooltip>
              <Tooltip content="Download">
                <IconButton
                  ariaLabel="download icon"
                  colorSchema="secondary"
                  className="group relative ml-2"
                  onClick={() => {
                    downloadTxtFile(
                      `${cmek.name}_${isAsymmetricKey ? "private_key" : "key_material"}`,
                      privateKeyData?.privateKey ?? ""
                    );
                  }}
                >
                  <FontAwesomeIcon icon={faDownload} />
                </IconButton>
              </Tooltip>
            </div>
          </div>
          <div className="mb-8 flex items-center justify-between rounded-md bg-white/[0.07] p-2 text-base text-gray-400">
            <p className="mr-4 break-all whitespace-pre-wrap">{privateKeyData?.privateKey}</p>
          </div>
        </>
      )}

      {isAsymmetricKey && canReadPublicKey && publicKeyData?.publicKey && (
        <>
          <div className="mb-4 flex items-center justify-between">
            <h2>Public Key (Base64)</h2>
            <div className="flex">
              <Tooltip content={copyPublicKeyText}>
                <IconButton
                  ariaLabel="copy icon"
                  colorSchema="secondary"
                  className="group relative"
                  onClick={() => {
                    navigator.clipboard.writeText(publicKeyData?.publicKey ?? "");
                    setCopyPublicKeyText("Copied");
                  }}
                >
                  <FontAwesomeIcon icon={isCopyingPublicKey ? faCheck : faCopy} />
                </IconButton>
              </Tooltip>
              <Tooltip content="Download">
                <IconButton
                  ariaLabel="download icon"
                  colorSchema="secondary"
                  className="group relative ml-2"
                  onClick={() => {
                    downloadTxtFile(`${cmek.name}_public_key`, publicKeyData?.publicKey ?? "");
                  }}
                >
                  <FontAwesomeIcon icon={faDownload} />
                </IconButton>
              </Tooltip>
            </div>
          </div>
          <div className="mb-8 flex items-center justify-between rounded-md bg-white/[0.07] p-2 text-base text-gray-400">
            <p className="mr-4 break-all whitespace-pre-wrap">{publicKeyData?.publicKey}</p>
          </div>
        </>
      )}
    </div>
  );
};

export const CmekExportKeyModal = ({ isOpen, onOpenChange, cmek }: Props) => {
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent title="Export Key">{cmek && <ExportKeyForm cmek={cmek} />}</ModalContent>
    </Modal>
  );
};
