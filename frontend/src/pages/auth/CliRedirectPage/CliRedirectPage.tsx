import { useState } from "react";
import { Link, useSearch } from "@tanstack/react-router";
import { CheckIcon, CopyIcon, EyeIcon, EyeOffIcon, KeyRoundIcon, TerminalIcon } from "lucide-react";

import { AuthPageLayout } from "@app/components/auth/AuthPageLayout";
import { AuthPagePanel } from "@app/components/auth/AuthPagePanel";
import { PageTitle } from "@app/components/PageTitle";
import {
  Button,
  CardContent,
  CardHeader,
  CardTitle,
  InputGroup,
  InputGroupAddon,
  InputGroupButton
} from "@app/components/v3";
import { SecretInput } from "@app/components/v3/platform";
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
  const [isTokenVisible, setIsTokenVisible] = useState(false);
  const cliToken = getTerminalCliToken();
  const { org_id: dashboardOrgId } = useSearch({ from: "/cli-redirect" });

  const copyUrlToClipboard = () => {
    if (cliToken) {
      navigator.clipboard.writeText(cliToken);
      setIsUrlCopied(true);
      sessionStorage.removeItem(SessionStorageKeys.CLI_TERMINAL_TOKEN);
    }
  };

  return (
    <AuthPageLayout variant="focused">
      <PageTitle title="CLI Login Successful" />
      <link rel="icon" href="/infisical.ico" />
      {cliToken ? (
        <AuthPagePanel className="text-center">
          <CardHeader className="mb-6 items-center gap-2 text-center">
            <div
              aria-hidden="true"
              className="mb-4 flex size-12 items-center justify-center justify-self-center rounded-lg bg-card text-foreground/80"
            >
              <KeyRoundIcon className="size-5" strokeWidth={1.75} />
            </div>
            <CardTitle className="justify-center text-center font-alliance text-2xl font-normal">
              Unable to reach CLI
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm text-label">
              Your login was successful, but Infisical couldn&apos;t automatically push your login
              token to the CLI. Please copy the token below and manually provide it to your CLI.
            </p>
            <InputGroup>
              <SecretInput
                aria-label="CLI login token"
                readOnly
                variant="plain"
                value={cliToken as string}
                isVisible={isTokenVisible}
                data-slot="input-group-control"
                containerClassName="px-2.5 py-2 font-mono text-left"
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  aria-label={isTokenVisible ? "Hide token" : "Reveal token"}
                  onClick={() => setIsTokenVisible((current) => !current)}
                >
                  {isTokenVisible ? <EyeOffIcon /> : <EyeIcon />}
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
            <Button variant="project" size="lg" isFullWidth onClick={copyUrlToClipboard}>
              {isUrlCopied ? <CheckIcon /> : <CopyIcon />}
              Copy to clipboard
            </Button>
          </CardContent>
        </AuthPagePanel>
      ) : (
        <AuthPagePanel className="text-center">
          <CardHeader className="mb-6 items-center gap-2 text-center">
            <div
              aria-hidden="true"
              className="mb-4 flex size-12 items-center justify-center justify-self-center rounded-lg bg-card text-foreground/80"
            >
              <TerminalIcon className="size-5" strokeWidth={1.75} />
            </div>
            <CardTitle className="justify-center text-center font-alliance text-2xl font-normal">
              Head back to your terminal
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm text-label">
              You&apos;ve successfully logged in to the Infisical CLI
            </p>
            {dashboardOrgId && (
              <Button asChild variant="outline" className="self-center">
                <Link to="/organizations/$orgId/projects" params={{ orgId: dashboardOrgId }}>
                  Open Infisical Dashboard
                </Link>
              </Button>
            )}
          </CardContent>
        </AuthPagePanel>
      )}
    </AuthPageLayout>
  );
};
