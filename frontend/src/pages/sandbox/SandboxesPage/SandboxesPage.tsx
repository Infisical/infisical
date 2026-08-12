import { useState } from "react";
import { Helmet } from "react-helmet";
import { useNavigate } from "@tanstack/react-router";
import { BoxIcon, PlusIcon } from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  PageHeader,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import { SandboxStatus, useListSandboxes } from "@app/hooks/api/sandboxes";

import { CreateSandboxSheet } from "./components/CreateSandboxSheet";

export const SandboxesPage = () => {
  const { currentOrg } = useOrganization();
  const navigate = useNavigate();
  const { data: sandboxes, isPending, isError } = useListSandboxes();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const running = sandboxes?.filter((s) => s.status === SandboxStatus.Running).length ?? 0;

  return (
    <>
      <Helmet>
        <title>Sandboxes</title>
      </Helmet>

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6">
        <div className="flex items-start justify-between gap-4">
          <PageHeader
            scope="org"
            icon={BoxIcon}
            title={<span className="sandbox-chrome-text">Sandbox</span>}
            description="Isolated environments for AI agents and untrusted code. Credentials stay outside the boundary."
            className="[&_svg]:sandbox-chrome-icon"
          />
          <Button variant="project" onClick={() => setIsCreateOpen(true)}>
            <PlusIcon className="size-4" />
            Create Sandbox
          </Button>
        </div>

        {isPending && <Skeleton className="h-64" />}

        {isError && (
          <Alert variant="danger">
            <AlertTitle>Could not load sandboxes</AlertTitle>
            <AlertDescription>Refresh the page to try again.</AlertDescription>
          </Alert>
        )}

        {sandboxes && sandboxes.length === 0 && (
          <Empty frame="dashed">
            <EmptyHeader>
              <EmptyMedia>
                <BoxIcon />
              </EmptyMedia>
              <EmptyTitle>No sandboxes yet</EmptyTitle>
              <EmptyDescription>
                Create a sandbox to give an agent a place to work without handing it credentials.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="project" onClick={() => setIsCreateOpen(true)}>
                <PlusIcon className="size-4" />
                Create Sandbox
              </Button>
            </EmptyContent>
          </Empty>
        )}

        {sandboxes && sandboxes.length > 0 && (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-muted">
              {sandboxes.length} sandbox{sandboxes.length === 1 ? "" : "es"} · {running} running
            </p>

            <Table>
              <TableHeader className="bg-container">
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Grants</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sandboxes.map((sandbox) => {
                  const grantCount =
                    sandbox.grants.integrations.length + sandbox.grants.pamAccountIds.length;

                  return (
                    <TableRow
                      key={sandbox.id}
                      className="cursor-pointer"
                      onClick={() =>
                        navigate({
                          to: "/organizations/$orgId/sandboxes/$sandboxId",
                          params: { orgId: currentOrg.id, sandboxId: sandbox.id }
                        })
                      }
                    >
                      <TableCell>
                        <p className="font-medium">{sandbox.name}</p>
                        {sandbox.description && (
                          <p className="truncate text-xs text-muted">{sandbox.description}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-muted">
                        {sandbox.vcpu} vCPU · {sandbox.memoryMb / 1024} GB
                      </TableCell>
                      <TableCell className="text-muted">
                        {grantCount === 0 ? "None" : `${grantCount} granted`}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={sandbox.status === SandboxStatus.Running ? "success" : "neutral"}
                        >
                          {sandbox.status === SandboxStatus.Running ? "Running" : "Stopped"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <CreateSandboxSheet
        isOpen={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onCreated={() => setIsCreateOpen(false)}
      />
    </>
  );
};
