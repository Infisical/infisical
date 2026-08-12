import { useState } from "react";
import { BotIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Field,
  FieldDescription,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import {
  SandboxAgentType,
  TSandbox,
  useGetSandboxCatalog,
  useUpdateSandbox
} from "@app/hooks/api/sandboxes";

export const AgentTab = ({ sandbox }: { sandbox: TSandbox }) => {
  const { data: catalog } = useGetSandboxCatalog();
  const updateSandbox = useUpdateSandbox();

  const [agentType, setAgentType] = useState<SandboxAgentType | "">(sandbox.agentType ?? "");
  const [token, setToken] = useState("");

  const definition = catalog?.agents.find((agent) => agent.type === agentType);

  const handleSave = async () => {
    if (!agentType) return;

    await updateSandbox.mutateAsync({
      sandboxId: sandbox.id,
      agentType: agentType as SandboxAgentType,
      ...(token.trim() && { agentToken: token.trim() })
    });

    setToken("");
    createNotification({ type: "success", text: "Agent updated" });
  };

  return (
    <div className="flex max-w-md flex-col gap-4">
      <Field>
        <FieldLabel htmlFor="agent-type">Agent</FieldLabel>
        <Select value={agentType} onValueChange={(v) => setAgentType(v as SandboxAgentType)}>
          <SelectTrigger id="agent-type" className="w-full">
            <SelectValue placeholder="Choose an agent" />
          </SelectTrigger>
          <SelectContent position="popper" className="w-(--radix-select-trigger-width)">
            {catalog?.agents.map((agent) => (
              <SelectItem key={agent.type} value={agent.type} disabled={!agent.isSupported}>
                {agent.name}
                {!agent.isSupported && " (coming soon)"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field>
        <FieldLabel htmlFor="agent-token">{definition?.tokenLabel ?? "API key"}</FieldLabel>
        <Input
          id="agent-token"
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder={
            sandbox.hasAgentToken
              ? "A key is configured. Enter a new one to replace it."
              : "Paste the key"
          }
        />
        <FieldDescription>
          Encrypted with your organization&apos;s key and never returned by the API.
        </FieldDescription>
      </Field>

      <div>
        <Button
          variant="project"
          onClick={handleSave}
          isDisabled={!agentType || (!sandbox.hasAgentToken && !token.trim())}
          isPending={updateSandbox.isPending}
        >
          <BotIcon className="size-4" />
          Save Agent
        </Button>
      </div>
    </div>
  );
};
