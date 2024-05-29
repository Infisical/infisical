import { useEffect } from "react";
import { faCheck, faCopy } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { IconButton,Modal, ModalContent  } from "@app/components/v2";
import { useToggle } from "@app/hooks";
import { useGetCertCert } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  popUp: UsePopUpState<["certificateCert"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["certificateCert"]>, state?: boolean) => void;
};

export const CertificateCertModal = ({ popUp, handlePopUpToggle }: Props) => {
  const { data } = useGetCertCert(
    (popUp?.certificateCert?.data as { certId: string })?.certId || ""
  );

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

  return (
    <Modal
      isOpen={popUp?.certificateCert?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("certificateCert", isOpen);
      }}
    >
      <ModalContent title="Export Certificate">
        {data ? (
          <div>
            <h2 className="mb-4">Serial Number</h2>
            <div className="mb-8 flex items-center justify-between rounded-md bg-white/[0.07] p-2 text-base text-gray-400">
              <p className="mr-4 break-all">{data.serialNumber}</p>
              <IconButton
                ariaLabel="copy icon"
                colorSchema="secondary"
                className="group relative"
                onClick={() => {
                  navigator.clipboard.writeText(data.serialNumber);
                  setIsSerialNumberCopied.on();
                }}
              >
                <FontAwesomeIcon icon={isSerialNumberCopied ? faCheck : faCopy} />
                <span className="absolute -left-8 -top-20 hidden w-28 translate-y-full rounded-md bg-bunker-800 py-2 pl-3 text-center text-sm text-gray-400 group-hover:flex group-hover:animate-fadeIn">
                  Click to copy
                </span>
              </IconButton>
            </div>
            <h2 className="mb-4">Certificate Body</h2>
            <div className="mb-8 flex items-center justify-between rounded-md bg-white/[0.07] p-2 text-base text-gray-400">
              <p className="mr-4 whitespace-pre-wrap break-all">{data.certificate}</p>
              <IconButton
                ariaLabel="copy icon"
                colorSchema="secondary"
                className="group relative"
                onClick={() => {
                  navigator.clipboard.writeText(data.certificate);
                  setIsCertificateCopied.on();
                }}
              >
                <FontAwesomeIcon icon={isCertificateCopied ? faCheck : faCopy} />
                <span className="absolute -left-8 -top-20 hidden w-28 translate-y-full rounded-md bg-bunker-800 py-2 pl-3 text-center text-sm text-gray-400 group-hover:flex group-hover:animate-fadeIn">
                  Click to copy
                </span>
              </IconButton>
            </div>
            <h2 className="mb-4">Certificate Chain</h2>
            <div className="mb-8 flex items-center justify-between rounded-md bg-white/[0.07] p-2 text-base text-gray-400">
              <p className="mr-4 whitespace-pre-wrap break-all">{data.certificateChain}</p>
              <IconButton
                ariaLabel="copy icon"
                colorSchema="secondary"
                className="group relative"
                onClick={() => {
                  navigator.clipboard.writeText(data.certificateChain);
                  setIsCertificateChainCopied.on();
                }}
              >
                <FontAwesomeIcon icon={isCertificateChainCopied ? faCheck : faCopy} />
                <span className="absolute -left-8 -top-20 hidden w-28 translate-y-full rounded-md bg-bunker-800 py-2 pl-3 text-center text-sm text-gray-400 group-hover:flex group-hover:animate-fadeIn">
                  Click to copy
                </span>
              </IconButton>
            </div>
            <h2 className="mb-4">Certificate Private Key</h2>
            <div className="mb-8 flex items-center justify-between rounded-md bg-white/[0.07] p-2 text-base text-gray-400">
              <p className="mr-4 whitespace-pre-wrap break-all">{data.privateKey}</p>
              <IconButton
                ariaLabel="copy icon"
                colorSchema="secondary"
                className="group relative"
                onClick={() => {
                  navigator.clipboard.writeText(data.certificateChain);
                  setIsCertificateSkCopied.on();
                }}
              >
                <FontAwesomeIcon icon={isCertificateSkCopied ? faCheck : faCopy} />
                <span className="absolute -left-8 -top-20 hidden w-28 translate-y-full rounded-md bg-bunker-800 py-2 pl-3 text-center text-sm text-gray-400 group-hover:flex group-hover:animate-fadeIn">
                  Click to copy
                </span>
              </IconButton>
            </div>
          </div>
        ) : (
          <div />
        )}
      </ModalContent>
    </Modal>
  );
};
