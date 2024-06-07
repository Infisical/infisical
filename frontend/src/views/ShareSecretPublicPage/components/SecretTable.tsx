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
  <div className="flex items-center w-full h-full rounded border border-solid border-mineshaft-700 bg-mineshaft-800 p-2">
    {isLoading && <div className="bg-mineshaft-800 text-center text-bunker-400">Loading...</div>}
    {!isLoading && !decryptedSecret && (
      <Tr>
        <Td colSpan={4} className="bg-mineshaft-800 text-center text-bunker-400">
          <EmptyState title="Secret has either expired or does not exist!" icon={faKey} />
        </Td>
      </Tr>
    )}
    {!isLoading && decryptedSecret && (
      <div className="relative h-full w-full p-2 border border-mineshaft-700 bg-mineshaft-900 overflow-y-auto dark">
        <div className="w-full h-full flex-1 break-words pr-4 overflow-y-scroll max-h-60 dark:[color-scheme:dark] thin-scrollbar">
          <div className="whitespace-pre-line w-full min-w-full">{decryptedSecret}</div>
        </div>
        <IconButton
          variant="outline_bg"
          colorSchema="primary"
          ariaLabel="copy to clipboard"
          onClick={copyUrlToClipboard}
          className="absolute right-6 top-2 rounded"
          size="xs"
        >
          <FontAwesomeIcon className="pr-2" icon={isUrlCopied ? faCheck : faCopy} /> Copy
        </IconButton>
      </div>
    )}
  </div>
);
