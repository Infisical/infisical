import { useMemo, useState } from "react";
import { faCopy } from "@fortawesome/free-regular-svg-icons";
import { faExternalLink, faUpRightFromSquare, faWarning } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import ms from "ms";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FormControl,
  FormLabel,
  IconButton,
  Input,
  Modal,
  ModalContent
} from "@app/components/v2";
import { PamResourceType, TPamAccount, useAccessPamAccount } from "@app/hooks/api/pam";

type Props = {
  account?: TPamAccount;
  accountPath?: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  projectId: string;
};

const AwsIamAccessContent = ({
  account,
  onOpenChange
}: {
  account: TPamAccount;
  onOpenChange: (isOpen: boolean) => void;
}) => {
  const [durationInput, setDurationInput] = useState("1h");
  const accessPamAccount = useAccessPamAccount();

  const parsedDuration = useMemo(() => {
    try {
      const milliseconds = ms(durationInput);
      if (!milliseconds) return null;
      const seconds = Math.floor(milliseconds / 1000);
      // Min 15 minutes (900s), max 1 hour (3600s) due to AWS role chaining limitation
      if (seconds < 900 || seconds > 3600) return null;
      return seconds;
    } catch {
      return null;
    }
  }, [durationInput]);

  const handleAccessConsole = async () => {
    if (!parsedDuration) return;

    try {
      const response = await accessPamAccount.mutateAsync({
        accountId: account.id,
        duration: `${parsedDuration}s`
      });

      if (response.consoleUrl) {
        // Open the AWS Console URL in a new tab
        window.open(response.consoleUrl, "_blank", "noopener,noreferrer");

        createNotification({
          text: "AWS Console opened in new tab",
          type: "success"
        });

        onOpenChange(false);
      } else {
        createNotification({
          text: "Failed to generate AWS Console URL",
          type: "error"
        });
      }
    } catch {
      createNotification({
        text: "Failed to access AWS Console",
        type: "error"
      });
    }
  };

  return (
    <>
      <FormControl
        label="Session Duration"
        helperText="Min 15m, max 1h (AWS role chaining limit). Examples: 30m, 1h"
        isError={durationInput.length > 0 && !parsedDuration}
        errorText="Invalid duration. Use format like 15m, 30m, 1h"
      >
        <Input
          value={durationInput}
          onChange={(e) => setDurationInput(e.target.value)}
          placeholder="1h"
        />
      </FormControl>

      <div className="mb-4 rounded-sm border border-yellow-600/30 bg-yellow-600/10 p-3">
        <div className="flex items-start gap-2">
          <FontAwesomeIcon icon={faWarning} className="mt-0.5 text-yellow-500" />
          <div className="text-xs text-yellow-500">
            <strong>Important:</strong> AWS Console sessions cannot be terminated early. The session
            remains active until the STS token expires. All activity is logged in AWS CloudTrail.
          </div>
        </div>
      </div>

      <Button
        onClick={handleAccessConsole}
        isLoading={accessPamAccount.isPending}
        isDisabled={!parsedDuration}
        colorSchema="secondary"
        className="w-full"
        leftIcon={<FontAwesomeIcon icon={faExternalLink} />}
      >
        Open AWS Console
      </Button>
    </>
  );
};

const CliAccessContent = ({
  account,
  onOpenChange,
  projectId,
  accountPath
}: {
  account: TPamAccount;
  onOpenChange: (isOpen: boolean) => void;
  projectId: string;
  accountPath?: string;
}) => {
  let fullAccountPath = account?.name;
  if (accountPath) {
    let path = accountPath;
    if (path.startsWith("/")) path = path.slice(1);
    fullAccountPath = `${path}/${account?.name}`;
  }

  const { protocol, hostname, port } = window.location;
  const portSuffix = port && port !== "80" && port !== "443" ? `:${port}` : "";
  const siteURL = `${protocol}//${hostname}${portSuffix}`;

  const [duration, setDuration] = useState("4h");

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
      default:
        return "";
    }
  }, [account, cliDuration]);

  return (
    <>
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
    </>
  );
};

export const PamAccessAccountModal = ({
  isOpen,
  onOpenChange,
  account,
  projectId,
  accountPath
}: Props) => {
  if (!account) return null;

  const isAwsIam = account.resource.resourceType === PamResourceType.AwsIam;

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        className="max-w-2xl pb-2"
        title="Access Account"
        subTitle={
          isAwsIam
            ? `Access ${account.name} via AWS Console.`
            : `Access ${account.name} using a CLI command.`
        }
      >
        {isAwsIam ? (
          <AwsIamAccessContent account={account} onOpenChange={onOpenChange} />
        ) : (
          <CliAccessContent
            account={account}
            onOpenChange={onOpenChange}
            projectId={projectId}
            accountPath={accountPath}
          />
        )}
      </ModalContent>
    </Modal>
  );
};
