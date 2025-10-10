import { faCheck, faCopy, faDownload } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import FileSaver from "file-saver";

import { IconButton, Tooltip } from "@app/components/v2";
import { useTimedReset } from "@app/hooks";

type Props = {
  serialNumber: string;
  certificate: string;
  certificateChain: string;
  privateKey?: string;
};

export const CertificateContent = ({
  serialNumber,
  certificate,
  certificateChain,
  privateKey
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
  const [copyTextCertificateChain, isCopyingCertificateChain, setCopyTextCertificateChain] =
    useTimedReset<string>({
      initialState: "Copy to clipboard"
    });

  const [copyTextCertificateSk, isCopyingCertificateSk, setCopyTextCertificateSk] =
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
        <h2>Certificate Body</h2>
        <div className="flex">
          <Tooltip content={copyTextCertificate}>
            <IconButton
              ariaLabel="copy icon"
              colorSchema="secondary"
              className="group relative"
              onClick={() => {
                navigator.clipboard.writeText(certificate);
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
                downloadTxtFile("cert.pem", certificate);
              }}
            >
              <FontAwesomeIcon icon={faDownload} />
            </IconButton>
          </Tooltip>
        </div>
      </div>
      <div className="mb-8 flex items-center justify-between rounded-md bg-white/[0.07] p-2 text-base text-gray-400">
        <p className="mr-4 whitespace-pre-wrap break-all">{certificate}</p>
      </div>
      {certificateChain && (
        <>
          <div className="mb-4 flex items-center justify-between">
            <h2>Certificate Chain</h2>
            <div className="flex">
              <Tooltip content={copyTextCertificateChain}>
                <IconButton
                  ariaLabel="copy icon"
                  colorSchema="secondary"
                  className="group relative"
                  onClick={() => {
                    navigator.clipboard.writeText(certificateChain);
                    setCopyTextCertificateChain("Copied");
                  }}
                >
                  <FontAwesomeIcon icon={isCopyingCertificateChain ? faCheck : faCopy} />
                </IconButton>
              </Tooltip>
              <Tooltip content="Download">
                <IconButton
                  ariaLabel="copy icon"
                  colorSchema="secondary"
                  className="group relative ml-2"
                  onClick={() => {
                    downloadTxtFile("chain.pem", certificateChain);
                  }}
                >
                  <FontAwesomeIcon icon={faDownload} />
                </IconButton>
              </Tooltip>
            </div>
          </div>
          <div className="mb-8 flex items-center justify-between rounded-md bg-white/[0.07] p-2 text-base text-gray-400">
            <p className="mr-4 whitespace-pre-wrap break-all">{certificateChain}</p>
          </div>
        </>
      )}
      {privateKey && (
        <>
          <div className="mb-4 flex items-center justify-between">
            <h2>Certificate Private Key</h2>
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
                    downloadTxtFile("private_key.txt", privateKey);
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
    </div>
  );
};
