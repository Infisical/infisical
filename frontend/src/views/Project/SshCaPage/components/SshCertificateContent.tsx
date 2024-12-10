import { faCheck, faCopy, faDownload } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import FileSaver from "file-saver";

import { IconButton, Tooltip } from "@app/components/v2";
import { useTimedReset } from "@app/hooks";

type Props = {
  serialNumber: string;
  signedKey: string;
  privateKey?: string;
  publicKey?: string;
};

export const SshCertificateContent = ({
  serialNumber,
  signedKey,
  privateKey,
  publicKey
}: Props) => {
  const [copyTextSerialNumber, isCopyingSerialNumber, setCopyTextSerialNumber] =
    useTimedReset<string>({
      initialState: "Copy to clipboard"
    });
  const [copyTextCertificate, isCopyingCertificate, setCopyTextCertificate] = useTimedReset<string>(
    {
      initialState: "Copy to clipboard"
    }
  );

  const [copyTextCertificateSk, isCopyingCertificateSk, setCopyTextCertificateSk] =
    useTimedReset<string>({
      initialState: "Copy to clipboard"
    });

  const [copyTextCertificatePk, isCopyingCertificatePk, setCopyTextCertificatePk] =
    useTimedReset<string>({
      initialState: "Copy to clipboard"
    });

  const downloadTxtFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    FileSaver.saveAs(blob, filename);
  };

  return (
    <div>
      <h2 className="mb-4">Serial Number</h2>
      <div className="mb-8 flex items-center justify-between rounded-md bg-white/[0.07] p-2 text-base text-gray-400">
        <p className="mr-4 break-all">{serialNumber}</p>
        <Tooltip content={copyTextSerialNumber}>
          <IconButton
            ariaLabel="copy icon"
            colorSchema="secondary"
            className="group relative"
            onClick={() => {
              navigator.clipboard.writeText(serialNumber);
              setCopyTextSerialNumber("Copied");
            }}
          >
            <FontAwesomeIcon icon={isCopyingSerialNumber ? faCheck : faCopy} />
          </IconButton>
        </Tooltip>
      </div>
      <div className="mb-4 flex items-center justify-between">
        <h2>SSH Certificate / Signed Key</h2>
        <div className="flex">
          <Tooltip content={copyTextCertificate}>
            <IconButton
              ariaLabel="copy icon"
              colorSchema="secondary"
              className="group relative"
              onClick={() => {
                navigator.clipboard.writeText(signedKey);
                setCopyTextCertificate("Copied");
              }}
            >
              <FontAwesomeIcon icon={isCopyingCertificate ? faCheck : faCopy} />
            </IconButton>
          </Tooltip>
          <Tooltip content="Download">
            <IconButton
              ariaLabel="copy icon"
              colorSchema="secondary"
              className="group relative ml-2"
              onClick={() => {
                downloadTxtFile("user_key-cert.pub", signedKey);
              }}
            >
              <FontAwesomeIcon icon={faDownload} />
            </IconButton>
          </Tooltip>
        </div>
      </div>
      <div className="mb-8 flex items-center justify-between rounded-md bg-white/[0.07] p-2 text-base text-gray-400">
        <p className="mr-4 whitespace-pre-wrap break-all">{signedKey}</p>
      </div>
      {privateKey && (
        <>
          <div className="mb-4 flex items-center justify-between">
            <h2>Private Key</h2>
            <div className="flex">
              <Tooltip content={copyTextCertificateSk}>
                <IconButton
                  ariaLabel="copy icon"
                  colorSchema="secondary"
                  className="group relative"
                  onClick={() => {
                    navigator.clipboard.writeText(privateKey);
                    setCopyTextCertificateSk("Copied");
                  }}
                >
                  <FontAwesomeIcon icon={isCopyingCertificateSk ? faCheck : faCopy} />
                </IconButton>
              </Tooltip>
              <Tooltip content={copyTextCertificateSk}>
                <IconButton
                  ariaLabel="copy icon"
                  colorSchema="secondary"
                  className="group relative ml-2"
                  onClick={() => {
                    downloadTxtFile("user_key.pem", privateKey);
                  }}
                >
                  <FontAwesomeIcon icon={faDownload} />
                </IconButton>
              </Tooltip>
            </div>
          </div>
          <div className="mb-8 flex items-center justify-between rounded-md bg-white/[0.07] p-2 text-base text-gray-400">
            <p className="mr-4 whitespace-pre-wrap break-all">{privateKey}</p>
          </div>
        </>
      )}
      {publicKey && (
        <>
          <div className="mb-4 flex items-center justify-between">
            <h2>Public Key</h2>
            <div className="flex">
              <Tooltip content={copyTextCertificatePk}>
                <IconButton
                  ariaLabel="copy icon"
                  colorSchema="secondary"
                  className="group relative"
                  onClick={() => {
                    navigator.clipboard.writeText(publicKey);
                    setCopyTextCertificatePk("Copied");
                  }}
                >
                  <FontAwesomeIcon icon={isCopyingCertificatePk ? faCheck : faCopy} />
                </IconButton>
              </Tooltip>
              <Tooltip content={copyTextCertificatePk}>
                <IconButton
                  ariaLabel="copy icon"
                  colorSchema="secondary"
                  className="group relative ml-2"
                  onClick={() => {
                    downloadTxtFile("user_key.pub", publicKey);
                  }}
                >
                  <FontAwesomeIcon icon={faDownload} />
                </IconButton>
              </Tooltip>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md bg-white/[0.07] p-2 text-base text-gray-400">
            <p className="mr-4 whitespace-pre-wrap break-all">{publicKey}</p>
          </div>
        </>
      )}
    </div>
  );
};
