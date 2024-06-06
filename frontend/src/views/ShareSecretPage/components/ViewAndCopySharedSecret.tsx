import { faCheck, faCopy } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { IconButton } from "@app/components/v2";

export const ViewAndCopySharedSecret = ({
  inModal,
  newSharedSecret,
  isUrlCopied,
  copyUrlToClipboard
}: {
  inModal: boolean;
  newSharedSecret: string;
  isUrlCopied: boolean;
  copyUrlToClipboard: () => void;
}) => {
  return (
    <div
      className={`w-[${inModal ? "33rem" : "36rem"}] ${
        !inModal && "border border-mineshaft-600 bg-mineshaft-800 p-4"
      }`}
    >
      <div className="mt-2 mb-3 mr-2 flex items-center justify-end rounded-md bg-white/[0.07] p-2 text-base text-gray-400">
        <p className="mr-4 break-all">{newSharedSecret}</p>
        <IconButton
          ariaLabel="copy icon"
          colorSchema="secondary"
          className="group relative"
          onClick={copyUrlToClipboard}
        >
          <FontAwesomeIcon icon={isUrlCopied ? faCheck : faCopy} />
          <span className="absolute -left-8 -top-20 hidden w-28 translate-y-full rounded-md bg-bunker-800 py-2 pl-3 text-center text-sm text-gray-400 group-hover:flex group-hover:animate-fadeIn">
            Click to Copy
          </span>
        </IconButton>
      </div>
    </div>
  );
};
