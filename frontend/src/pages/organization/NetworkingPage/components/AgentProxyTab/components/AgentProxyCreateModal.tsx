import { useState } from "react";
import { TriangleAlertIcon } from "lucide-react";

import {
  Alert,
  AlertDescription,
  Button,
  CodeBlock,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input
} from "@app/components/v3";
import {
  useCreateAgentProxy,
  useGenerateAgentProxyEnrollmentToken
} from "@app/hooks/api/agentProxies";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

// A hostname, optionally with a leading "*." label. Matches what the API accepts, so a bad entry is
// caught before the round trip.
const HOST_REGEX =
  /^(\*\.)?([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)*[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/;

const parseAllowedHosts = (raw: string) =>
  raw
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);

export const AgentProxyCreateModal = ({ isOpen, onOpenChange }: Props) => {
  const [name, setName] = useState("");
  const [allowedHostsInput, setAllowedHostsInput] = useState("");
  const [nameError, setNameError] = useState<string>();
  const [hostsError, setHostsError] = useState<string>();
  const [enrollment, setEnrollment] = useState<{ name: string; token: string }>();

  const { mutateAsync: createAgentProxy, isPending: isCreating } = useCreateAgentProxy();
  const { mutateAsync: generateToken, isPending: isGenerating } =
    useGenerateAgentProxyEnrollmentToken();

  const handleCreate = async () => {
    const trimmedName = name.trim();
    const allowedHosts = parseAllowedHosts(allowedHostsInput);

    let hasError = false;
    if (!trimmedName) {
      setNameError("Name is required");
      hasError = true;
    } else {
      setNameError(undefined);
    }

    const invalidHosts = allowedHosts.filter((host) => !HOST_REGEX.test(host));
    if (invalidHosts.length) {
      setHostsError(`Not a hostname: ${invalidHosts.join(", ")}`);
      hasError = true;
    } else {
      setHostsError(undefined);
    }
    if (hasError) return;

    try {
      const agentProxy = await createAgentProxy({
        name: trimmedName,
        ...(allowedHosts.length ? { allowedHosts } : {})
      });

      // Minted immediately: an enrollment token is the only thing that gets the proxy running, and it
      // is shown once.
      const { token } = await generateToken(agentProxy.id);
      setEnrollment({ name: agentProxy.name, token });
    } catch {
      // The shared mutation error handler surfaces the API error.
    }
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      setName("");
      setAllowedHostsInput("");
      setNameError(undefined);
      setHostsError(undefined);
      setEnrollment(undefined);
    }
    onOpenChange(open);
  };

  if (enrollment) {
    const command = `infisical agent-proxy start --token=${enrollment.token}`;
    return (
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Run {enrollment.name}</DialogTitle>
            <DialogDescription>
              Run this on the host that agents will point their HTTP proxy at.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <CodeBlock label="Run on the agent proxy host" value={command} />
            <Alert variant="warning">
              <TriangleAlertIcon />
              <AlertDescription>
                The enrollment token is shown once and can only be used once.
              </AlertDescription>
            </Alert>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="org" type="button">
                  Done
                </Button>
              </DialogClose>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create Agent Proxy</DialogTitle>
          <DialogDescription>
            An agent proxy brokers credentials for agents on the intersection of agent and user
            policies.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Field data-invalid={Boolean(nameError)}>
            <FieldLabel htmlFor="agent-proxy-name">Name</FieldLabel>
            <Input
              id="agent-proxy-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-agent-proxy"
              isError={Boolean(nameError)}
              autoFocus
            />
            <FieldError>{nameError}</FieldError>
          </Field>
          <Field data-invalid={Boolean(hostsError)}>
            <FieldLabel htmlFor="agent-proxy-allowed-hosts">Allowed hosts</FieldLabel>
            <Input
              id="agent-proxy-allowed-hosts"
              value={allowedHostsInput}
              onChange={(e) => setAllowedHostsInput(e.target.value)}
              placeholder="registry.npmjs.org, *.pypi.org"
              isError={Boolean(hostsError)}
            />
            <FieldDescription>
              Hosts that pass through with no credential. Everything else is blocked unless a policy
              covers it, so list what an agent needs to function.
            </FieldDescription>
            <FieldError>{hostsError}</FieldError>
          </Field>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" type="button">
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="org"
              onClick={handleCreate}
              isPending={isCreating || isGenerating}
              isDisabled={isCreating || isGenerating || !name.trim()}
            >
              Create Agent Proxy
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};
