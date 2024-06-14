import { useEffect } from "react";
import { faCheck, faCopy, faDownload } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { IconButton, Modal, ModalContent } from "@app/components/v2";
import { useToggle } from "@app/hooks";
import { useGetCaCrl } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  popUp: UsePopUpState<["caCrl"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["caCrl"]>, state?: boolean) => void;
};

export const CaCrlModal = ({ popUp, handlePopUpToggle }: Props) => {
  const [isCrlCopied, setIsCrlCopied] = useToggle(false);
  const { data: crl } = useGetCaCrl((popUp?.caCrl?.data as { caId: string })?.caId || "");

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isCrlCopied) {
      timer = setTimeout(() => setIsCrlCopied.off(), 2000);
    }

    return () => clearTimeout(timer);
  }, [isCrlCopied]);

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
    <Modal
      isOpen={popUp?.caCrl?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("caCrl", isOpen);
      }}
    >
      <ModalContent title="CA Certificate Revocation List (CRL)">
        <div>
          {crl && (
            <>
              {/* <div className="mb-4 flex items-center justify-between">
                <h2>Manual CRL Rotation</h2>
                <Button
                  // isLoading={isLoading}
                  // isDisabled={!isAllowed}
                  colorSchema="primary"
                  variant="outline_bg"
                  type="submit"
                  // onClick={() => handleAssignment(username, !isPartOfGroup)}
                  onClick={() => {}}
                >
                  Rotate
                </Button>
              </div> */}
              <div className="mb-4 flex items-center justify-between">
                <h2>Certificate Revocation List</h2>
                <div className="flex">
                  <IconButton
                    ariaLabel="copy icon"
                    colorSchema="secondary"
                    className="group relative"
                    onClick={() => {
                      navigator.clipboard.writeText(crl);
                      setIsCrlCopied.on();
                    }}
                  >
                    <FontAwesomeIcon icon={isCrlCopied ? faCheck : faCopy} />
                    <span className="absolute -left-8 -top-20 hidden w-28 translate-y-full rounded-md bg-bunker-800 py-2 pl-3 text-center text-sm text-gray-400 group-hover:flex group-hover:animate-fadeIn">
                      Copy
                    </span>
                  </IconButton>
                  <IconButton
                    ariaLabel="copy icon"
                    colorSchema="secondary"
                    className="group relative ml-2"
                    onClick={() => {
                      downloadTxtFile("crl.pem", crl);
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
                <p className="mr-4 whitespace-pre-wrap break-all">{crl}</p>
              </div>
            </>
          )}
        </div>
      </ModalContent>
    </Modal>
  );
};
