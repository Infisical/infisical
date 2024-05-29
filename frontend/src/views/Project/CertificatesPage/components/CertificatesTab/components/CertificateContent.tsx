import { useEffect } from "react";
import { faCheck, faCopy, faDownload } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { IconButton } from "@app/components/v2";
import { useToggle } from "@app/hooks";

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
  const [isSerialNumberCopied, setIsSerialNumberCopied] = useToggle(false);
  const [isCertificateCopied, setIsCertificateCopied] = useToggle(false);
  const [isCertificateChainCopied, setIsCertificateChainCopied] = useToggle(false);
  const [isCertificateSkCopied, setIsCertificateSkCopied] = useToggle(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isSerialNumberCopied) {
      timer = setTimeout(() => setIsSerialNumberCopied.off(), 2000);
    }

    if (isCertificateCopied) {
      timer = setTimeout(() => setIsCertificateCopied.off(), 2000);
    }

    if (isCertificateChainCopied) {
      timer = setTimeout(() => setIsCertificateChainCopied.off(), 2000);
    }

    if (isCertificateSkCopied) {
      timer = setTimeout(() => setIsCertificateSkCopied.off(), 2000);
    }

    return () => clearTimeout(timer);
  }, [isSerialNumberCopied, isCertificateCopied, isCertificateChainCopied, isCertificateSkCopied]);

  const downloadTxtFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <h2 className="mb-4">Serial Number</h2>
      <div className="mb-8 flex items-center justify-between rounded-md bg-white/[0.07] p-2 text-base text-gray-400">
        <p className="mr-4 break-all">{serialNumber}</p>
        <IconButton
          ariaLabel="copy icon"
          colorSchema="secondary"
          className="group relative"
          onClick={() => {
            navigator.clipboard.writeText(serialNumber);
            setIsSerialNumberCopied.on();
          }}
        >
          <FontAwesomeIcon icon={isSerialNumberCopied ? faCheck : faCopy} />
          <span className="absolute -left-8 -top-20 hidden w-28 translate-y-full rounded-md bg-bunker-800 py-2 pl-3 text-center text-sm text-gray-400 group-hover:flex group-hover:animate-fadeIn">
            Click to copy
          </span>
        </IconButton>
      </div>
      <div className="mb-4 flex items-center justify-between">
        <h2>Certificate Body</h2>
        <div className="flex">
          <IconButton
            ariaLabel="copy icon"
            colorSchema="secondary"
            className="group relative"
            onClick={() => {
              navigator.clipboard.writeText(certificate);
              setIsCertificateCopied.on();
            }}
          >
            <FontAwesomeIcon icon={isCertificateCopied ? faCheck : faCopy} />
            <span className="absolute -left-8 -top-20 hidden w-28 translate-y-full rounded-md bg-bunker-800 py-2 pl-3 text-center text-sm text-gray-400 group-hover:flex group-hover:animate-fadeIn">
              Copy
            </span>
          </IconButton>
          <IconButton
            ariaLabel="copy icon"
            colorSchema="secondary"
            className="group relative ml-2"
            onClick={() => {
              downloadTxtFile("certificate.txt", certificate);
            }}
          >
            <FontAwesomeIcon icon={faDownload} />
            <span className="absolute -left-8 -top-20 hidden w-28 translate-y-full rounded-md bg-bunker-800 py-2 pl-3 text-center text-sm text-gray-400 group-hover:flex group-hover:animate-fadeIn">
              Download
            </span>
          </IconButton>
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
              <IconButton
                ariaLabel="copy icon"
                colorSchema="secondary"
                className="group relative"
                onClick={() => {
                  navigator.clipboard.writeText(certificateChain);
                  setIsCertificateChainCopied.on();
                }}
              >
                <FontAwesomeIcon icon={isCertificateChainCopied ? faCheck : faCopy} />
                <span className="absolute -left-8 -top-20 hidden w-28 translate-y-full rounded-md bg-bunker-800 py-2 pl-3 text-center text-sm text-gray-400 group-hover:flex group-hover:animate-fadeIn">
                  Copy
                </span>
              </IconButton>
              <IconButton
                ariaLabel="copy icon"
                colorSchema="secondary"
                className="group relative ml-2"
                onClick={() => {
                  downloadTxtFile("certificate_chain.txt", certificateChain);
                }}
              >
                <FontAwesomeIcon icon={faDownload} />
                <span className="absolute -left-8 -top-20 hidden w-28 translate-y-full rounded-md bg-bunker-800 py-2 pl-3 text-center text-sm text-gray-400 group-hover:flex group-hover:animate-fadeIn">
                  Download
                </span>
              </IconButton>
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
              <IconButton
                ariaLabel="copy icon"
                colorSchema="secondary"
                className="group relative"
                onClick={() => {
                  navigator.clipboard.writeText(privateKey);
                  setIsCertificateSkCopied.on();
                }}
              >
                <FontAwesomeIcon icon={isCertificateSkCopied ? faCheck : faCopy} />
                <span className="absolute -left-8 -top-20 hidden w-28 translate-y-full rounded-md bg-bunker-800 py-2 pl-3 text-center text-sm text-gray-400 group-hover:flex group-hover:animate-fadeIn">
                  Copy
                </span>
              </IconButton>
              <IconButton
                ariaLabel="copy icon"
                colorSchema="secondary"
                className="group relative ml-2"
                onClick={() => {
                  downloadTxtFile("private_key.txt", privateKey);
                }}
              >
                <FontAwesomeIcon icon={faDownload} />
                <span className="absolute -left-8 -top-20 hidden w-28 translate-y-full rounded-md bg-bunker-800 py-2 pl-3 text-center text-sm text-gray-400 group-hover:flex group-hover:animate-fadeIn">
                  Download
                </span>
              </IconButton>
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
