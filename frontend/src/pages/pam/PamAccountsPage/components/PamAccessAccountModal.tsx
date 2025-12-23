import { useMemo, useState } from "react";
import { faCopy } from "@fortawesome/free-regular-svg-icons";
import { faGlobe, faUpRightFromSquare } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import ms from "ms";

import { createNotification } from "@app/components/notifications";
import { Button, FormLabel, IconButton, Input, Modal, ModalContent } from "@app/components/v2";
import {
  PamResourceType,
  TPamAccount,
  TPamBrowserSession,
  useCreateBrowserSession,
  useTerminateBrowserSession
} from "@app/hooks/api/pam";

import { PamBrowserSessionModal } from "./PamBrowserSessionModal";

type Props = {
  account?: TPamAccount;
  accountPath?: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  projectId: string;
};

export const PamAccessAccountModal = ({
  isOpen,
  onOpenChange,
  account,
  projectId,
  accountPath
}: Props) => {
  const [duration, setDuration] = useState("4h");
  const [isBrowserSessionModalOpen, setIsBrowserSessionModalOpen] = useState(false);
  const [browserSession, setBrowserSession] = useState<TPamBrowserSession | null>(null);

  const { mutateAsync: createBrowserSession, isPending: isCreatingSession } =
    useCreateBrowserSession();
  const { mutateAsync: terminateSession } = useTerminateBrowserSession();

  const { protocol, hostname, port } = window.location;
  const portSuffix = port && port !== "80" && port !== "443" ? `:${port}` : "";
  const siteURL = `${protocol}//${hostname}${portSuffix}`;

  let fullAccountPath = account?.name ?? "";
  if (accountPath) {
    const path = accountPath.replace(/^\/+|\/+$/g, "");
    fullAccountPath = `${path}/${account?.name ?? ""}`;
  }

  const isDurationValid = useMemo(() => duration && ms(duration || "1s") > 0, [duration]);

  const cliDuration = useMemo(() => {
    if (!duration) return duration;

    const unit = duration.replace(/[\d\s.-]/g, "");

    const dayOrLargerUnits = [
      "d",
      "day",
      "days",
      "w",
      "week",
      "weeks",
      "y",
      "yr",
      "yrs",
      "year",
      "years"
    ];

    // ms library does not handle months (M) so we do it separately
    if (unit === "M") {
      const value = parseInt(duration, 10);
      if (!Number.isNaN(value) && value > 0) {
        const hours = value * 30 * 24;
        return `${hours}h`;
      }
    } else if (dayOrLargerUnits.includes(unit.toLowerCase())) {
      const valueInMs = ms(duration);
      const oneHourInMs = 1000 * 60 * 60;

      if (typeof valueInMs === "number" && valueInMs > 0) {
        const hours = Math.floor(valueInMs / oneHourInMs);
        return `${hours}h`;
      }
    }

    return duration;
  }, [duration]);

  const command = useMemo(() => {
    if (!account) return "";

    switch (account.resource.resourceType) {
      case PamResourceType.Postgres:
      case PamResourceType.MySQL:
        return `infisical pam db access-account ${fullAccountPath} --project-id ${projectId} --duration ${cliDuration} --domain ${siteURL}`;
      case PamResourceType.SSH:
        return `infisical pam ssh access-account ${fullAccountPath} --project-id ${projectId} --duration ${cliDuration} --domain ${siteURL}`;
      case PamResourceType.Kubernetes:
        return `infisical pam kubernetes access-account ${fullAccountPath} --project-id ${projectId} --duration ${cliDuration} --domain ${siteURL}`;
      default:
        return "";
    }
  }, [account, fullAccountPath, projectId, cliDuration, siteURL]);

  // Handler for browser access
  const handleBrowserAccess = async () => {
    if (!isDurationValid) {
      createNotification({
        type: "error",
        text: "Please enter a valid duration"
      });
      return;
    }

    try {
      // Terminate existing session if any
      if (browserSession?.sessionId) {
        try {
          await terminateSession({ sessionId: browserSession.sessionId });
        } catch {
          // Ignore errors from terminating old session
        }
      }

      // Clear previous state
      setBrowserSession(null);
      setIsBrowserSessionModalOpen(false);

      // Create new session
      const session = await createBrowserSession({
        accountPath: fullAccountPath,
        projectId,
        duration
      });

      // Set session data and open browser session modal
      setBrowserSession(session);
      setIsBrowserSessionModalOpen(true);
    } catch (error: any) {
      createNotification({
        type: "error",
        text: error?.message || "Failed to create browser session"
      });
    }
  };

  // Check if browser access is available (PostgreSQL only for now)
  const isBrowserAccessAvailable = account?.resource.resourceType === PamResourceType.Postgres;

  if (!account) return null;

  return (
    <>
      <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
        <ModalContent
          className="max-w-2xl pb-2"
          title="Access Account"
          subTitle={`Access ${account.name} using a CLI command.`}
        >
          <FormLabel
            label="Duration"
            tooltipText="The maximum duration of your session. Ex: 1h, 3w, 30d"
          />
          <Input
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="permanent"
            isError={!isDurationValid}
          />
          <FormLabel label="CLI Command" className="mt-4" />
          <div className="flex gap-2">
            <Input value={command} isDisabled />
            <IconButton
              ariaLabel="copy"
              variant="outline_bg"
              colorSchema="secondary"
              onClick={() => {
                navigator.clipboard.writeText(command);

                createNotification({
                  text: "Command copied to clipboard",
                  type: "info"
                });

                onOpenChange(false);
              }}
              className="w-10"
            >
              <FontAwesomeIcon icon={faCopy} />
            </IconButton>
          </div>
          <a
            href="https://infisical.com/docs/cli/overview"
            target="_blank"
            className="mt-2 flex h-4 w-fit items-center gap-2 border-b border-mineshaft-400 text-sm text-mineshaft-400 transition-colors duration-100 hover:border-yellow-400 hover:text-yellow-400"
            rel="noreferrer"
          >
            <span>Install the Infisical CLI</span>
            <FontAwesomeIcon icon={faUpRightFromSquare} className="size-3" />
          </a>

          {/* Browser Access Section */}
          {isBrowserAccessAvailable && (
            <>
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-mineshaft-600" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-mineshaft-900 px-2 text-mineshaft-400">OR</span>
                </div>
              </div>

              <div className="mb-2">
                <FormLabel label="Browser Access" />
                <p className="mb-3 text-xs text-bunker-400">
                  Connect directly from your browser and execute SQL queries
                </p>
                <Button
                  onClick={handleBrowserAccess}
                  isLoading={isCreatingSession}
                  isDisabled={isCreatingSession || !isDurationValid}
                  className="w-full"
                  size="sm"
                  colorSchema="secondary"
                  leftIcon={<FontAwesomeIcon icon={faGlobe} />}
                >
                  Connect in Browser
                </Button>
              </div>
            </>
          )}

          {!isBrowserAccessAvailable && (
            <div className="mt-4 rounded-md bg-mineshaft-800 p-3 text-xs text-bunker-400">
              Browser access is currently available for PostgreSQL databases only.
            </div>
          )}
        </ModalContent>
      </Modal>

      <PamBrowserSessionModal
        key={browserSession?.sessionId || "no-session"}
        isOpen={isBrowserSessionModalOpen}
        onOpenChange={(open) => {
          setIsBrowserSessionModalOpen(open);
          // Close the access modal when browser session modal opens
          if (open) {
            onOpenChange(false);
          }
        }}
        session={browserSession}
      />
    </>
  );
};
