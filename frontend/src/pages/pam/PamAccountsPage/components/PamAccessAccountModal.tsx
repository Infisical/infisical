import { useMemo, useState } from "react";
import { faCopy } from "@fortawesome/free-regular-svg-icons";
import { faGlobe, faSpinner, faTerminal, faUpRightFromSquare } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "@tanstack/react-router";
import ms from "ms";

import { createNotification } from "@app/components/notifications";
import { Button, FormLabel, IconButton, Input, Modal, ModalContent } from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization } from "@app/context";
import { PamResourceType, TPamAccount, useCreateWebSession } from "@app/hooks/api/pam";
import { apiRequest } from "@app/config/request";

type Props = {
  account?: TPamAccount;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  projectId: string;
};

export const PamAccessAccountModal = ({ isOpen, onOpenChange, account, projectId }: Props) => {
  const { currentOrg } = useOrganization();
  const [duration, setDuration] = useState("4h");

  const { protocol, hostname, port } = window.location;
  const portSuffix = port && port !== "80" && port !== "443" ? `:${port}` : "";
  const siteURL = `${protocol}//${hostname}${portSuffix}`;

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
        return `infisical pam db access --resource ${account.resource.name} --account ${account.name} --project-id ${projectId} --duration ${cliDuration} --domain ${siteURL}`;
      case PamResourceType.Redis:
        return `infisical pam redis access --resource ${account.resource.name} --account ${account.name} --project-id ${projectId} --duration ${cliDuration} --domain ${siteURL}`;
      case PamResourceType.SSH:
        return `infisical pam ssh access --resource ${account.resource.name} --account ${account.name} --project-id ${projectId} --duration ${cliDuration} --domain ${siteURL}`;
      case PamResourceType.Kubernetes:
        return `infisical pam kubernetes access --resource ${account.resource.name} --account ${account.name} --project-id ${projectId} --duration ${cliDuration} --domain ${siteURL}`;
      default:
        return "";
    }
  }, [account, projectId, cliDuration, siteURL]);

  const createWebSession = useCreateWebSession();
  const [isConnecting, setIsConnecting] = useState(false);
  const [webSessionId, setWebSessionId] = useState<string | null>(null);

  const handleWebAppConnect = async () => {
    if (!account) return;
    try {
      setIsConnecting(true);
      const { sessionId } = await createWebSession.mutateAsync({
        accountId: account.id,
        projectId
      });
      setWebSessionId(sessionId);
    } catch (err) {
      createNotification({
        text: `Failed to create web session: ${err instanceof Error ? err.message : "Unknown error"}`,
        type: "error"
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const handleWebSessionClose = async () => {
    if (webSessionId) {
      try {
        await apiRequest.post(`/api/v1/pam/web-sessions/${webSessionId}/end`);
      } catch {
        // best effort
      }
    }
    setWebSessionId(null);
    onOpenChange(false);
  };

  if (!account) return null;

  const isWebApp = account.resource.resourceType === PamResourceType.WebApp;
  const showWebAccess = account.resource.resourceType === PamResourceType.Postgres;

  // WebApp: full-screen iframe overlay when session is active
  if (isWebApp && webSessionId) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-bunker-800">
        <div className="flex items-center gap-3 border-b border-mineshaft-600 bg-mineshaft-900 px-4 py-2">
          <div className="flex items-center gap-2">
            <FontAwesomeIcon icon={faGlobe} className="text-primary" />
            <span className="text-sm font-medium text-mineshaft-200">
              {account.resource.name}
            </span>
            <span className="text-xs text-mineshaft-400">({account.name})</span>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-green-500" />
            <span className="text-xs text-mineshaft-400">Connected</span>
          </div>
          <Button
            size="xs"
            colorSchema="danger"
            variant="outline_bg"
            onClick={handleWebSessionClose}
          >
            End Session
          </Button>
        </div>
        <iframe
          src={`/api/v1/pam/web-sessions/${webSessionId}/proxy/`}
          title="Web Access Session"
          className="flex-1 border-0"
          referrerPolicy="no-referrer"
        />
      </div>
    );
  }

  // WebApp: connect modal
  if (isWebApp) {
    return (
      <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
        <ModalContent
          className="max-w-md pb-2"
          title="Connect to Web Application"
          subTitle={`Open ${account.resource.name} in your browser`}
        >
          <p className="mb-4 text-sm text-mineshaft-400">
            This will establish a secure tunnel through the gateway and open the internal website.
          </p>
          <Button
            className="w-full"
            colorSchema="primary"
            isLoading={isConnecting}
            isDisabled={isConnecting}
            leftIcon={<FontAwesomeIcon icon={isConnecting ? faSpinner : faGlobe} spin={isConnecting} />}
            onClick={handleWebAppConnect}
          >
            {isConnecting ? "Establishing tunnel..." : "Connect"}
          </Button>
        </ModalContent>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        className="max-w-2xl pb-2"
        title="Access Account"
        subTitle={`Connect to ${account.name}`}
      >
        <div className="py-1">
          <p className="text-sm font-medium text-mineshaft-400">Terminal</p>
          <p className="mb-2 text-xs text-mineshaft-400">Connect using the Infisical CLI</p>
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
        </div>
        {showWebAccess && (
          <>
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-mineshaft-600" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-mineshaft-900 px-2 text-mineshaft-400">OR</span>
              </div>
            </div>
            <div className="py-1">
              <p className="text-sm font-medium text-mineshaft-400">Browser</p>
              <p className="mb-2 text-xs text-mineshaft-400">Connect directly from your browser</p>
              <Link
                to={ROUTE_PATHS.Pam.PamAccountAccessPage.path}
                params={{
                  orgId: currentOrg.id,
                  projectId,
                  resourceType: account.resource.resourceType,
                  resourceId: account.resource.id,
                  accountId: account.id
                }}
                target="_blank"
                className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-primary/80"
              >
                <FontAwesomeIcon icon={faTerminal} />
                Connect in Browser
              </Link>
            </div>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};
