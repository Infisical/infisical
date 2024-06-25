import { faCheck, faCopy, faKey } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { EmptyState, IconButton, Td, Tr } from "@app/components/v2";

type Props = {
  isLoading: boolean;
  decryptedSecret: string;
  isUrlCopied: boolean;
  copyUrlToClipboard: () => void;
};

export const SecretTable = ({
  isLoading,
  decryptedSecret,
  isUrlCopied,
  copyUrlToClipboard
}: Props) => (
  <div className="flex w-full items-center justify-center rounded-md border border-solid border-mineshaft-700 bg-mineshaft-800 p-2">
    {isLoading && <div className="bg-mineshaft-800 text-center text-bunker-400">Loading...</div>}
    {!isLoading && !decryptedSecret && (
      <Tr>
        <Td colSpan={4} className="bg-mineshaft-800 text-center text-bunker-400">
          <EmptyState title="Secret has either expired or does not exist!" icon={faKey} />
        </Td>
      </Tr>
    )}
    {!isLoading && decryptedSecret && (
      <div className="dark relative flex h-full w-full items-center overflow-y-auto border border-mineshaft-700 bg-mineshaft-900 p-2">
        <div className="thin-scrollbar flex h-full max-h-44 w-full flex-1 overflow-y-scroll break-words pr-4 dark:[color-scheme:dark]">
          <div className="align-center flex w-full min-w-full whitespace-pre-line">
            {decryptedSecret}
          </div>
        </div>
        <IconButton
          variant="outline_bg"
          colorSchema="primary"
          ariaLabel="copy to clipboard"
          onClick={copyUrlToClipboard}
          className="mx-1 flex max-h-8 items-center rounded absolute top-1 sm:top-2 right-0 sm:right-5"
          size="xs"
        >
          <FontAwesomeIcon className="pr-2" icon={isUrlCopied ? faCheck : faCopy} /> Copy
        </IconButton>
      </div>
    )}
  </div>
);
