import Head from "next/head";
import Image from "next/image";
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

export default function CliRedirect() {
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
    <div className="flex flex-col justify-between bg-bunker-800 md:h-screen">
      <Head>
        <title>Infisical CLI | Login Successful!</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <div className="flex h-screen w-screen flex-col items-center justify-center space-y-4 text-gray-200">
        <div className="mb-4 flex justify-center">
          <Image src="/images/gradientLogo.svg" height={90} width={120} alt="Infisical Logo" />
        </div>
        {cliToken ? (
          <>
            <div className="pb-4">
              <p className="bg-gradient-to-b from-white to-bunker-200 bg-clip-text text-center text-3xl font-medium text-transparent">
                Unable to reach CLI
              </p>
              <p className="text-light mb-1 text-lg text-mineshaft-400 text-center">
                Your login was successful but, Infisical couldn&apos;t automatically push your login token to the CLI.
              </p>
              <p className="text-light mb-1 text-lg text-mineshaft-400 text-center">
                Please copy the token below and manually provide it to your CLI.
              </p>
            </div>
            <div className="dark relative flex max-h-36 max-w-xl flex-col items-center space-y-4 overflow-y-auto rounded-md border border-mineshaft-700 bg-mineshaft-900 p-3">
              <SecretInput value={cliToken as string} />
              <div className="mx-1 flex">
                <IconButton
                  variant="outline_bg"
                  colorSchema="primary"
                  ariaLabel="copy to clipboard"
                  onClick={copyUrlToClipboard}
                  className=" flex items-center rounded py-2"
                >
                  <FontAwesomeIcon className="pr-2" icon={isUrlCopied ? faCheck : faCopy} /> Copy to
                  clipboard
                </IconButton>
              </div>
            </div>
          </>
        ) : (
          <>
            <p className="bg-gradient-to-b from-white to-bunker-200 bg-clip-text text-center text-3xl font-medium text-transparent">
              Head back to your terminal
            </p>
            <p className="text-light mb-1 text-lg text-mineshaft-400">
              You&apos;ve successfully logged in to the Infisical CLI
            </p>
          </>
        )}
      </div>
    </div>
  );
}
