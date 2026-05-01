import { useEffect, useMemo, useState } from "react";
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
import { useConfigureGatewayTokenAuth } from "@app/hooks/api/gateways-v2";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  gatewayData: { id: string; name: string; isPending: boolean } | null;
};

export const ReEnrollGatewayModal = ({ isOpen, onOpenChange, gatewayData }: Props) => {
  const { protocol, hostname, port } = window.location;
  const portSuffix = port && port !== "80" ? `:${port}` : "";
  const siteURL = `${protocol}//${hostname}${portSuffix}`;

  const [enrollmentToken, setEnrollmentToken] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const { mutateAsync: configureTokenAuth } = useConfigureGatewayTokenAuth();

  useEffect(() => {
    if (!isOpen || !gatewayData) return;

    setIsLoading(true);
    configureTokenAuth({ gatewayId: gatewayData.id })
      .then((result) => {
        setEnrollmentToken(result.token);
      })
      .catch(() => {
        createNotification({ type: "error", text: "Failed to generate enrollment token" });
        onOpenChange(false);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [isOpen, gatewayData?.id]);

  const gatewayName = gatewayData?.name ?? "";

  const cliCommand = useMemo(() => {
    return `infisical gateway start ${gatewayName} --enroll-method=token --token=${enrollmentToken} --domain=${siteURL}`;
  }, [gatewayName, enrollmentToken, siteURL]);

  const systemdInstallCommand = useMemo(() => {
    return `sudo infisical gateway systemd install ${gatewayName} --enroll-method=token --token=${enrollmentToken} --domain=${siteURL}`;
  }, [gatewayName, enrollmentToken, siteURL]);

  const startServiceCommand = "sudo systemctl start infisical-gateway";

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    createNotification({ text: `${label} copied to clipboard`, type: "info" });
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      setEnrollmentToken("");
    }
    onOpenChange(open);
  };

  if (!gatewayData) return null;

  return (
    <Modal isOpen={isOpen} onOpenChange={handleClose}>
      <ModalContent
        className="max-w-2xl"
        title={`Re-enroll ${gatewayData.name}`}
        subTitle="The existing gateway will keep running until the new machine enrolls."
      >
        {isLoading ? (
          <p className="text-sm text-mineshaft-300">Generating enrollment token...</p>
        ) : (
          <>
            <p className="mb-3 text-sm text-mineshaft-300">
              Run the following command on the machine where you want to deploy the gateway. The
              token expires in 1 hour and can only be used once.
            </p>
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
                    onClick={() => copyToClipboard(cliCommand, "Command")}
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
                    ariaLabel="copy install command"
                    variant="outline_bg"
                    colorSchema="secondary"
                    onClick={() => copyToClipboard(systemdInstallCommand, "Installation command")}
                    className="w-10"
                  >
                    <FontAwesomeIcon icon={faCopy} />
                  </IconButton>
                </div>
                <FormLabel label="Start the Gateway Service" className="mt-4" />
                <div className="flex gap-2">
                  <Input value={startServiceCommand} isDisabled />
                  <IconButton
                    ariaLabel="copy start command"
                    variant="outline_bg"
                    colorSchema="secondary"
                    onClick={() => copyToClipboard(startServiceCommand, "Start command")}
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
              className="mt-2 flex h-4 w-fit items-center gap-2 border-b border-mineshaft-400 text-sm text-mineshaft-400 transition-colors duration-100 hover:border-yellow-400 hover:text-yellow-400"
              rel="noreferrer"
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
          </>
        )}
      </ModalContent>
    </Modal>
  );
};
