import { useMemo, useState } from "react";
import { faCopy } from "@fortawesome/free-regular-svg-icons";
import { faUpRightFromSquare } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import ms from "ms";

import { createNotification } from "@app/components/notifications";
import { FormLabel, IconButton, Input, Modal, ModalContent } from "@app/components/v2";
import { PamResourceType, TPamAccount } from "@app/hooks/api/pam";

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

  const { protocol, hostname, port } = window.location;
  const portSuffix = port && port !== "80" && port !== "443" ? `:${port}` : "";
  const siteURL = `${protocol}//${hostname}${portSuffix}`;

  let fullAccountPath = `/${account?.name ?? ""}`;
  if (accountPath) {
    const path = accountPath.replace(/^\/+|\/+$/g, "");
    fullAccountPath = `/${path}/${account?.name ?? ""}`;
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
      case PamResourceType.Redis:
        return `infisical pam redis access-account ${fullAccountPath} --project-id ${projectId} --duration ${cliDuration} --domain ${siteURL}`;
      case PamResourceType.SSH:
        return `infisical pam ssh access-account ${fullAccountPath} --project-id ${projectId} --duration ${cliDuration} --domain ${siteURL}`;
      case PamResourceType.Kubernetes:
        return `infisical pam kubernetes access-account ${fullAccountPath} --project-id ${projectId} --duration ${cliDuration} --domain ${siteURL}`;
      default:
        return "";
    }
  }, [account, fullAccountPath, projectId, cliDuration, siteURL]);

  if (!account) return null;

  return (
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
      </ModalContent>
    </Modal>
  );
};
