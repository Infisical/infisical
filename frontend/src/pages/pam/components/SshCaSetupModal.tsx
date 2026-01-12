import { faCopy } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { Button, IconButton, Input, Modal, ModalContent } from "@app/components/v2";
import { getAuthToken } from "@app/hooks/api/reactQuery";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  resourceId: string;
};

export const SshCaSetupModal = ({ isOpen, onOpenChange, resourceId }: Props) => {
  const { protocol, hostname, port } = window.location;
  const portSuffix = port && port !== "80" ? `:${port}` : "";
  const siteURL = `${protocol}//${hostname}${portSuffix}`;

  const setupSshCaCommand = `curl -H "Authorization: Bearer ${getAuthToken()}" "${siteURL}/api/v1/pam/resources/ssh/${resourceId}/ssh-ca-setup" | sudo bash`;

  const handleCopy = () => {
    navigator.clipboard.writeText(setupSshCaCommand);
    createNotification({
      text: "Command copied to clipboard",
      type: "info"
    });
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        className="max-w-2xl"
        title="Certificate Authentication Setup (Optional)"
        subTitle="If you're using certificate-based authentication, configure the target host to trust the CA certificate."
      >
        <div className="flex flex-col">
          <span className="text-sm text-mineshaft-300">Run this command on the target host:</span>
          <div className="mt-2 flex items-center gap-1">
            <Input value={setupSshCaCommand} isDisabled />
            <IconButton
              ariaLabel="copy"
              variant="plain"
              colorSchema="secondary"
              size="sm"
              onClick={handleCopy}
              className="size-8 shrink-0"
            >
              <FontAwesomeIcon icon={faCopy} className="text-mineshaft-200" />
            </IconButton>
          </div>
          <div className="mt-4 flex flex-col gap-1 text-sm text-mineshaft-300">
            <span>This command will:</span>
            <span>• Install the resource CA certificate</span>
            <span>• Configure SSH to trust certificate-based authentication</span>
            <span>• Enable seamless access for authorized users</span>
          </div>
        </div>
        <div className="mt-6 flex justify-end">
          <Button colorSchema="secondary" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </ModalContent>
    </Modal>
  );
};
