import { useMemo, useState } from "react";
import { faCopy, faUpRightFromSquare } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import {
  Button,
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
import { Badge } from "@app/components/v3/generic/Badge";
import { useCreateRelay, useGenerateRelayEnrollmentToken } from "@app/hooks/api/relays";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

type Step = "form" | "command";

export const RelayDeployModal = ({ isOpen, onOpenChange }: Props) => {
  const [step, setStep] = useState<Step>("form");
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [enrollmentToken, setEnrollmentToken] = useState("");
  const [formErrors, setFormErrors] = useState<string[]>([]);

  const { mutateAsync: createRelay, isPending: isCreating } = useCreateRelay();
  const { mutateAsync: generateToken } = useGenerateRelayEnrollmentToken();

  const { protocol, hostname, port } = window.location;
  const portSuffix = port && port !== "80" ? `:${port}` : "";
  const siteURL = `${protocol}//${hostname}${portSuffix}`;

  const cliCommand = useMemo(() => {
    return `infisical relay start --name=${name} --host=${host} --enroll-method=token --token=${enrollmentToken} --domain=${siteURL}`;
  }, [name, host, enrollmentToken, siteURL]);

  const systemdInstallCommand = useMemo(() => {
    return `sudo infisical relay systemd install --name=${name} --host=${host} --enroll-method=token --token=${enrollmentToken} --domain=${siteURL}`;
  }, [name, host, enrollmentToken, siteURL]);

  const startServiceCommand = "sudo systemctl start infisical-relay";

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    createNotification({ type: "info", text: `${label} copied to clipboard` });
  };

  const handleCreate = async () => {
    const errors: string[] = [];
    if (!name.trim()) errors.push("Name is required");
    if (!host.trim()) errors.push("Host is required");
    if (errors.length) {
      setFormErrors(errors);
      return;
    }
    setFormErrors([]);

    try {
      const relay = await createRelay({
        name: name.trim(),
        host: host.trim(),
        authMethod: { method: "token" }
      });

      const tokenResult = await generateToken({ relayId: relay.id });
      setEnrollmentToken(tokenResult.token);
      setStep("command");
    } catch (err: any) {
      createNotification({
        type: "error",
        text: err?.message || "Failed to create relay"
      });
    }
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      setStep("form");
      setName("");
      setHost("");
      setEnrollmentToken("");
      setFormErrors([]);
    }
    onOpenChange(open);
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={handleClose}>
      <ModalContent
        className="max-w-2xl"
        title="Deploy Relay"
        subTitle={
          step === "form"
            ? "Create a new relay and generate an enrollment token."
            : "Run the following command on the machine where you want to deploy the relay."
        }
        bodyClassName="overflow-visible"
      >
        {step === "form" && (
          <div className="flex flex-col gap-4">
            {formErrors.length > 0 && (
              <div className="rounded-md bg-red-500/10 p-3">
                {formErrors.map((e) => (
                  <p key={e} className="text-sm text-red-400">
                    {e}
                  </p>
                ))}
              </div>
            )}
            <FormControl label="Name" isRequired>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="my-relay"
              />
            </FormControl>
            <FormControl label="Host" isRequired>
              <Input
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="10.0.0.5 or relay.example.com"
              />
            </FormControl>
            <div className="flex items-center gap-2">
              <FormLabel label="Auth Method" className="mb-0 text-foreground" />
              <Badge variant="info">Token Auth</Badge>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Button
                onClick={handleCreate}
                isLoading={isCreating}
                isDisabled={isCreating}
                size="sm"
              >
                Create Relay
              </Button>
              <ModalClose asChild>
                <Button size="sm" colorSchema="secondary">
                  Cancel
                </Button>
              </ModalClose>
            </div>
          </div>
        )}

        {step === "command" && (
          <div>
            <div className="mb-4">
              <div className="mb-0.5 flex items-center gap-2">
                <FormLabel label="Auth Method" className="mb-0 text-foreground" />
                <Badge variant="info">Token Auth</Badge>
              </div>
              <p className="mt-1 text-xs text-mineshaft-400">
                The enrollment token expires in 1 hour and can only be used once.
              </p>
            </div>

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
                <FormLabel label="Start the Relay Service" className="mt-4" />
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
          </div>
        )}
      </ModalContent>
    </Modal>
  );
};
