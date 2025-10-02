import { useMemo, useState } from "react";
import { faUpRightFromSquare } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import ms from "ms";

import { createNotification } from "@app/components/notifications";
import { Button, FormLabel, Input, Modal, ModalClose, ModalContent } from "@app/components/v2";
import { TPamAccount } from "@app/hooks/api/pam";

type Props = {
  account?: TPamAccount;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const PamAccessAccountModal = ({ isOpen, onOpenChange, account }: Props) => {
  const [duration, setDuration] = useState("4h");

  const isDurationValid = useMemo(() => duration && ms(duration || "1s") > 0, [duration]);

  const command = useMemo(
    () => (account ? `infisical pam access ${account.id} --duration ${duration}` : ""),
    [account, duration]
  );

  if (!account) return null;

  const copyCommand = () => {
    navigator.clipboard.writeText(command);

    createNotification({
      text: "Command copied to clipboard",
      type: "info"
    });

    onOpenChange(false);
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        className="max-w-2xl"
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
        <Input value={command} isDisabled />
        <a
          href="https://infisical.com/docs/cli/overview"
          target="_blank"
          className="mt-2 flex h-4 w-fit items-center gap-2 border-b border-mineshaft-400 text-sm text-mineshaft-400 transition-colors duration-100 hover:border-yellow-400 hover:text-yellow-400"
          rel="noreferrer"
        >
          <span>Install the Infisical CLI</span>
          <FontAwesomeIcon icon={faUpRightFromSquare} className="size-3" />
        </a>
        <div className="mt-6 flex items-center">
          <Button
            isDisabled={!isDurationValid}
            className="mr-4"
            size="sm"
            colorSchema="secondary"
            onClick={copyCommand}
          >
            Copy Command
          </Button>
          <ModalClose asChild>
            <Button colorSchema="secondary" variant="plain">
              Cancel
            </Button>
          </ModalClose>
        </div>
      </ModalContent>
    </Modal>
  );
};
