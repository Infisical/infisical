import { useState } from "react";
import { KeyRoundIcon, PlusIcon, Trash2Icon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  IconButton
} from "@app/components/v3";
import {
  TSandbox,
  useGetSandboxCatalog,
  useRemoveSandboxIntegration
} from "@app/hooks/api/sandboxes";

import { AddIntegrationSheet } from "./AddIntegrationSheet";

export const IntegrationsTab = ({ sandbox }: { sandbox: TSandbox }) => {
  const { data: catalog } = useGetSandboxCatalog();
  const removeIntegration = useRemoveSandboxIntegration();
  const [isAddOpen, setIsAddOpen] = useState(false);

  const handleRemove = async (integrationId: string) => {
    await removeIntegration.mutateAsync({ sandboxId: sandbox.id, integrationId });
    createNotification({ type: "success", text: "Integration removed" });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Integrations</CardTitle>
        <CardDescription>
          Each integration brokers one secret to a fixed set of hosts. The sandbox only ever holds a
          placeholder.
        </CardDescription>
        <CardAction>
          <Button variant="project" onClick={() => setIsAddOpen(true)}>
            <PlusIcon />
            Add Integration
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent>
        {sandbox.grants.integrations.length === 0 ? (
          <Empty frame="dashed">
            <EmptyHeader>
              <EmptyMedia>
                <KeyRoundIcon />
              </EmptyMedia>
              <EmptyTitle>No integrations</EmptyTitle>
              <EmptyDescription>
                This sandbox cannot reach any external service yet.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="flex flex-col gap-2">
            {sandbox.grants.integrations.map((integration) => {
              const definition = catalog?.integrations.find((i) => i.type === integration.type);

              return (
                <li
                  key={integration.id}
                  className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {definition?.name ?? integration.type}
                      </span>
                      {definition?.cli && (
                        <Badge variant="neutral">{definition.cli.name} CLI</Badge>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {integration.hostnames.join(", ")}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-[11px] text-muted">
                      {integration.secret.secretKey}
                    </p>
                  </div>
                  <IconButton
                    variant="ghost"
                    size="xs"
                    aria-label="Remove integration"
                    onClick={() => handleRemove(integration.id)}
                  >
                    <Trash2Icon className="size-3.5 text-danger" />
                  </IconButton>
                </li>
              );
            })}
          </ul>
        )}

        <AddIntegrationSheet
          sandboxId={sandbox.id}
          isOpen={isAddOpen}
          onOpenChange={setIsAddOpen}
        />
      </CardContent>
    </Card>
  );
};
