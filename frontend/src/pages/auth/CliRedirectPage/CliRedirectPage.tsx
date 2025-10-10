import { Helmet } from "react-helmet";
import { faCheck, faCopy } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { IconButton, SecretInput } from "@app/components/v2";
import { SessionStorageKeys } from "@app/const";
import { useTimedReset } from "@app/hooks";

const getTerminalCliToken = () => {
  const cliTerminalTokenInfo = sessionStorage.getItem(SessionStorageKeys.CLI_TERMINAL_TOKEN);
  if (!cliTerminalTokenInfo) return;

  const { expiry, data } = JSON.parse(cliTerminalTokenInfo);
  if (new Date() > new Date(expiry)) {
    sessionStorage.removeItem(SessionStorageKeys.CLI_TERMINAL_TOKEN);
    return;
  }

  // eslint-disable-next-line
  return data as string;
};

export const CliRedirectPage = () => {
  const [isUrlCopied, , setIsUrlCopied] = useTimedReset<boolean>({
    initialState: false
  });
  const cliToken = getTerminalCliToken();

  const copyUrlToClipboard = () => {
    if (cliToken) {
      navigator.clipboard.writeText(cliToken);
      setIsUrlCopied(true);
      sessionStorage.removeItem(SessionStorageKeys.CLI_TERMINAL_TOKEN);
    }
  };

  return (
    <div className="bg-bunker-800 flex flex-col justify-between md:h-screen">
      <Helmet>
        <title>Infisical CLI | Login Successful!</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <div className="flex h-screen w-screen flex-col items-center justify-center space-y-4 text-gray-200">
        <div className="mb-4 flex justify-center">
          <img
            src="/images/gradientLogo.svg"
            style={{
              height: "90px",
              width: "120px"
            }}
            alt="Infisical Logo"
          />
        </div>
        {cliToken ? (
          <>
            <div className="pb-4">
              <p className="bg-linear-to-b to-bunker-200 from-white bg-clip-text text-center text-3xl font-medium text-transparent">
                Unable to reach CLI
              </p>
              <p className="text-light text-mineshaft-400 mb-1 text-center text-lg">
                Your login was successful but, Infisical couldn&apos;t automatically push your login
                token to the CLI.
              </p>
              <p className="text-light text-mineshaft-400 mb-1 text-center text-lg">
                Please copy the token below and manually provide it to your CLI.
              </p>
            </div>
            <div className="border-mineshaft-700 bg-mineshaft-900 dark relative flex max-h-36 max-w-xl flex-col items-center space-y-4 overflow-y-auto rounded-md border p-3">
              <SecretInput value={cliToken as string} />
              <div className="mx-1 flex">
                <IconButton
                  variant="outline_bg"
                  colorSchema="primary"
                  ariaLabel="copy to clipboard"
                  onClick={copyUrlToClipboard}
                  className="flex items-center rounded-sm py-2"
                >
                  <FontAwesomeIcon className="pr-2" icon={isUrlCopied ? faCheck : faCopy} /> Copy to
                  clipboard
                </IconButton>
              </div>
            </div>
          </>
        ) : (
          <>
            <p className="bg-linear-to-b to-bunker-200 from-white bg-clip-text text-center text-3xl font-medium text-transparent">
              Head back to your terminal
            </p>
            <p className="text-light text-mineshaft-400 mb-1 text-lg">
              You&apos;ve successfully logged in to the Infisical CLI
            </p>
          </>
        )}
      </div>
    </div>
  );
};
