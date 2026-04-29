import { useMemo } from "react";
import { faCopy, faUpRightFromSquare } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FormLabel,
  IconButton,
  Input,
  Modal,
  ModalClose,
  ModalContent,
  Tab,
  TabList,
  TabPanel,
  Tabs
} from "@app/components/v2";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  gatewayName: string;
  enrollmentToken: string;
};

/**
 * Renders the bootstrap-token CLI snippet. Used after the operator generates a fresh
 * enrollment token from the Token Auth method. Same surface as the legacy ReEnrollGatewayModal —
 * just decoupled from the implicit "re-enroll" affordance, since enrollment-token issuance is
 * now an explicit action under the attached Token Auth method.
 */
export const EnrollmentTokenDialog = ({
  isOpen,
  onOpenChange,
  gatewayName,
  enrollmentToken
}: Props) => {
  const { protocol, hostname, port } = window.location;
  const portSuffix = port && port !== "80" ? `:${port}` : "";
  const siteURL = `${protocol}//${hostname}${portSuffix}`;

  const cliCommand = useMemo(
    () =>
      `infisical gateway start ${gatewayName} --enroll-method=token --token=${enrollmentToken} --domain=${siteURL}`,
    [gatewayName, enrollmentToken, siteURL]
  );

  const systemdInstallCommand = useMemo(
    () =>
      `sudo infisical gateway systemd install ${gatewayName} --enroll-method=token --token=${enrollmentToken} --domain=${siteURL}`,
    [gatewayName, enrollmentToken, siteURL]
  );

  const startServiceCommand = "sudo systemctl start infisical-gateway";

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    createNotification({ type: "info", text: `${label} copied to clipboard` });
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        className="max-w-2xl"
        title={`Enrollment Token for ${gatewayName}`}
        subTitle="Run the following command on the machine where you want to deploy the gateway. The token expires in 1 hour and can only be used once."
      >
        <Tabs defaultValue="cli" className="mt-2">
          <TabList>
            <Tab value="cli">CLI</Tab>
            <Tab value="systemd">CLI (systemd)</Tab>
          </TabList>
          <TabPanel value="cli">
            <div className="flex gap-2">
              <Input value={cliCommand} isDisabled />
              <IconButton
                ariaLabel="copy"
                variant="outline_bg"
                colorSchema="secondary"
                onClick={() => copy(cliCommand, "Command")}
                className="w-10"
              >
                <FontAwesomeIcon icon={faCopy} />
              </IconButton>
            </div>
          </TabPanel>
          <TabPanel value="systemd">
            <FormLabel label="Installation Command" />
            <div className="flex gap-2">
              <Input value={systemdInstallCommand} isDisabled />
              <IconButton
                ariaLabel="copy install"
                variant="outline_bg"
                colorSchema="secondary"
                onClick={() => copy(systemdInstallCommand, "Installation command")}
                className="w-10"
              >
                <FontAwesomeIcon icon={faCopy} />
              </IconButton>
            </div>
            <FormLabel label="Start the Gateway Service" className="mt-4" />
            <div className="flex gap-2">
              <Input value={startServiceCommand} isDisabled />
              <IconButton
                ariaLabel="copy start"
                variant="outline_bg"
                colorSchema="secondary"
                onClick={() => copy(startServiceCommand, "Start command")}
                className="w-10"
              >
                <FontAwesomeIcon icon={faCopy} />
              </IconButton>
            </div>
          </TabPanel>
        </Tabs>
        <a
          href="https://infisical.com/docs/cli/overview"
          target="_blank"
          rel="noreferrer"
          className="mt-2 flex h-4 w-fit items-center gap-2 border-b border-mineshaft-400 text-sm text-mineshaft-400 transition-colors hover:border-yellow-400 hover:text-yellow-400"
        >
          <span>Install the Infisical CLI</span>
          <FontAwesomeIcon icon={faUpRightFromSquare} className="size-3" />
        </a>
        <div className="mt-6 flex items-center">
          <ModalClose asChild>
            <Button className="mr-4" size="sm" colorSchema="secondary">
              Done
            </Button>
          </ModalClose>
        </div>
      </ModalContent>
    </Modal>
  );
};
