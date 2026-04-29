import { useMemo, useState } from "react";
import { faCopy, faUpRightFromSquare } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FilterableSelect,
  FormControl,
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
import { useGetRelays } from "@app/hooks/api/relays/queries";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  gatewayId: string;
  gatewayName: string;
};

const AUTO_RELAY_OPTION = { id: "_auto", name: "Auto Select Relay" };

/**
 * AWS Auth has no enrollment token to issue — the gateway authenticates by signing an STS
 * GetCallerIdentity request. This dialog shows the start command parameterized by gateway
 * id/name plus the relay choice (operator picks here, command bakes
 * `--target-relay-name=<picked>` when not auto). Mirrors EnrollmentTokenDialog so operators
 * see the same shape regardless of which method they're using.
 */
export const AwsStartCommandDialog = ({ isOpen, onOpenChange, gatewayId, gatewayName }: Props) => {
  const { protocol, hostname, port } = window.location;
  const portSuffix = port && port !== "80" ? `:${port}` : "";
  const siteURL = `${protocol}//${hostname}${portSuffix}`;

  const { data: relays, isPending: isRelaysLoading } = useGetRelays();
  const [relay, setRelay] = useState<{ id: string; name: string }>(AUTO_RELAY_OPTION);

  const resolvedRelayName = relay.id === "_auto" ? "" : relay.name;

  const cliCommand = useMemo(() => {
    const relayPart = resolvedRelayName ? ` --target-relay-name=${resolvedRelayName}` : "";
    return `infisical gateway start ${gatewayName} --enroll-method=aws --gateway-id=${gatewayId}${relayPart} --domain=${siteURL}`;
  }, [gatewayName, gatewayId, resolvedRelayName, siteURL]);

  const systemdInstallCommand = useMemo(() => {
    const relayPart = resolvedRelayName ? ` --target-relay-name=${resolvedRelayName}` : "";
    return `sudo infisical gateway systemd install ${gatewayName} --enroll-method=aws --gateway-id=${gatewayId}${relayPart} --domain=${siteURL}`;
  }, [gatewayName, gatewayId, resolvedRelayName, siteURL]);

  const startServiceCommand = "sudo systemctl start infisical-gateway";

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    createNotification({ type: "info", text: `${label} copied to clipboard` });
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        className="max-w-2xl"
        title={`Start command for ${gatewayName}`}
        subTitle="Run the following command on the host where you want to deploy the gateway. The host must have AWS credentials whose principal matches your allowlist."
        bodyClassName="overflow-visible"
      >
        <FormControl
          label="Relay"
          tooltipText="The relay this gateway should connect through. Auto Select picks one server-side at connect time."
        >
          <FilterableSelect
            value={relay}
            onChange={(newValue) =>
              setRelay((newValue as { id: string; name: string }) ?? AUTO_RELAY_OPTION)
            }
            isLoading={isRelaysLoading}
            options={[AUTO_RELAY_OPTION, ...(relays || [])]}
            placeholder="Select relay..."
            getOptionLabel={(option) => option.name}
            getOptionValue={(option) => option.id}
          />
        </FormControl>

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
