import { faArrowRight, faCheck, faCopy, faEye, faEyeSlash, faKey } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button, EmptyState, IconButton, Td, Tr } from "@app/components/v2";
import { useToggle } from "@app/hooks";
import { SecretSharingAccessType } from "@app/hooks/api/secretSharing/types";

type Props = {
  isLoading: boolean;
  decryptedSecret: string;
  isUrlCopied: boolean;
  copyUrlToClipboard: () => void;
  accessType?: SecretSharingAccessType;
  orgName?: string;
};

const replaceContentWithDot = (str: string) => {
  let finalStr = "";
  for (let i = 0; i < str.length; i += 1) {
    const char = str.at(i);
    finalStr += char === "\n" ? "\n" : "*";
  }
  return finalStr;
};

export const SecretTable = ({
  isLoading,
  decryptedSecret,
  isUrlCopied,
  copyUrlToClipboard,
  accessType,
  orgName
}: Props) => {
  const [isVisible, setIsVisible] = useToggle(false);
  const title = orgName
    ? (<p>Someone from <strong>{orgName}</strong> organization has shared a secret with you</p>)
    : (<p>You need to be logged in to view this secret</p>);

  return (
    <div className="flex w-full items-center justify-center rounded-md border border-solid border-mineshaft-700 bg-mineshaft-800 p-2">
      {isLoading && <div className="bg-mineshaft-800 text-center text-bunker-400">Loading...</div>}
      {!isLoading && !decryptedSecret && accessType !== SecretSharingAccessType.Organization && (
        <Tr>
          <Td colSpan={4} className="bg-mineshaft-800 text-center text-bunker-400">
            <EmptyState title="Secret has either expired or does not exist!" icon={faKey} />
          </Td>
        </Tr>
      )}
      {!isLoading && !decryptedSecret && accessType === SecretSharingAccessType.Organization && (
        <Tr>
          <Td colSpan={4} className="bg-mineshaft-800 text-center text-bunker-4000">
            <EmptyState title={title} icon={faKey}>
              <div className="flex flex-1 flex-col items-center justify-center pt-6">
                <a
                  href="/login"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button
                    colorSchema="primary"
                    size="sm"
                    onClick={() => {}}
                    rightIcon={<FontAwesomeIcon icon={faArrowRight} className="ml-2" />}
                  >
                    Login into <strong>{orgName}</strong> to view this secret
                  </Button>
                </a>
              </div>
            </EmptyState>
          </Td>
        </Tr>
      )}
      {!isLoading && decryptedSecret && (
        <div className="dark relative flex h-full w-full items-center overflow-y-auto rounded-md border border-mineshaft-700 bg-mineshaft-900 p-2 pr-2 md:p-3">
          <div
            className={`thin-scrollbar flex h-full max-h-44 w-full flex-1 overflow-y-scroll ${
              isVisible ? "break-words" : "break-all"
            } pr-4 dark:[color-scheme:dark]`}
          >
            <div className="align-center flex w-full min-w-full whitespace-pre-line">
              {isVisible ? decryptedSecret : replaceContentWithDot(decryptedSecret)}
            </div>
          </div>
          <div className="absolute top-1 right-0 mx-1 flex max-h-8 sm:top-2 sm:right-5">
            <IconButton
              variant="outline_bg"
              colorSchema="primary"
              ariaLabel="copy to clipboard"
              onClick={copyUrlToClipboard}
              className="mr-1 flex max-h-8 items-center rounded"
              size="xs"
            >
              <FontAwesomeIcon className="pr-2" icon={isUrlCopied ? faCheck : faCopy} /> Copy
            </IconButton>
            <IconButton
              variant="outline_bg"
              colorSchema="primary"
              ariaLabel="toggle visibility"
              onClick={() => setIsVisible.toggle()}
              className="flex max-h-8 items-center rounded"
              size="xs"
            >
              <FontAwesomeIcon icon={isVisible ? faEyeSlash : faEye} />
            </IconButton>
          </div>
        </div>
      )}
    </div>
  );
};
