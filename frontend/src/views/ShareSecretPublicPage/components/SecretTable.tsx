import { faCheck, faCopy, faKey } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { EmptyState, IconButton, SecretInput, Td, Tr } from "@app/components/v2";

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
  <div className="flex items-center rounded border border-solid border-mineshaft-700 bg-mineshaft-800 p-4">
    {isLoading && <div className="bg-mineshaft-800 text-center text-bunker-400">Loading...</div>}
    {!isLoading && !decryptedSecret && (
      <Tr>
        <Td colSpan={4} className="bg-mineshaft-800 text-center text-bunker-400">
          <EmptyState title="Secret has either expired or does not exist!" icon={faKey} />
        </Td>
      </Tr>
    )}
    {!isLoading && decryptedSecret && (
      <>
        <div className="min-w-[12rem] max-w-[20rem] flex-1 break-words pr-4">
          <SecretInput isVisible value={decryptedSecret} readOnly />
        </div>
        <IconButton
          ariaLabel="copy to clipboard"
          onClick={copyUrlToClipboard}
          className="rounded p-2 hover:bg-gray-700"
          size="xs"
        >
          <FontAwesomeIcon icon={isUrlCopied ? faCheck : faCopy} />
        </IconButton>
      </>
    )}
  </div>
);
