import { faCheck, faCopy, faKey } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  EmptyState,
  IconButton,
  Table,
  TableContainer,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { TViewSharedSecretResponse } from "@app/hooks/api/secretSharing";

type Props = {
  isLoading: boolean;
  sharedSecret?: TViewSharedSecretResponse;
  decryptedSecret: string;
  timeLeft: string;
  isUrlCopied: boolean;
  copyUrlToClipboard: () => void;
};

export const SecretTable = ({
  isLoading,
  sharedSecret,
  decryptedSecret,
  timeLeft,
  isUrlCopied,
  copyUrlToClipboard
}: Props) => {
  return (
    <TableContainer>
      <Table>
        <THead>
          <Tr>
            <Th>Name</Th>
            <Th>Value</Th>
            <Th>Valid Until</Th>
          </Tr>
        </THead>
        <TBody>
          {!isLoading && sharedSecret && decryptedSecret && (
            <Tr key={sharedSecret.name}>
              <Td>{sharedSecret.name}</Td>
              <Td>
                <div className="flex items-center md:space-x-2">
                  <div className="max-w-[20rem] flex-1 break-words">{decryptedSecret}</div>
                  <IconButton
                    ariaLabel="copy to clipboard"
                    onClick={copyUrlToClipboard}
                    className="rounded p-2 hover:bg-gray-700"
                    size="xs"
                  >
                    <FontAwesomeIcon icon={isUrlCopied ? faCheck : faCopy} />
                  </IconButton>
                </div>
              </Td>
              <Td>{timeLeft}</Td>
            </Tr>
          )}
          {isLoading && (
            <Tr>
              <Td colSpan={4} className="bg-mineshaft-800 text-center text-bunker-400">
                Loading...
              </Td>
            </Tr>
          )}
          {!isLoading && !sharedSecret && (
            <Tr>
              <Td colSpan={4} className="bg-mineshaft-800 text-center text-bunker-400">
                <EmptyState title="No such secret is shared yet!" icon={faKey} />
              </Td>
            </Tr>
          )}
          {!isLoading && sharedSecret && !decryptedSecret && (
            <Tr>
              <Td colSpan={4} className="bg-mineshaft-800 text-center text-bunker-400">
                <EmptyState title="Invalid URL to fetch the Secret!" icon={faKey} />
              </Td>
            </Tr>
          )}
        </TBody>
      </Table>
    </TableContainer>
  );
};
