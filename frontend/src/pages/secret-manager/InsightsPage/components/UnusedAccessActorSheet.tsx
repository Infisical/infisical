import { useState } from "react";
import { useParams } from "@tanstack/react-router";
import axios from "axios";
import { FolderIcon, KeyIcon } from "lucide-react";

import { GoToSecretButton } from "@app/components/secrets/GoToSecretButton";
import {
  Badge,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { useProject } from "@app/context";
import {
  TGetUnusedAccessActorResponse,
  TUnusedAccessActor,
  UnusedAccessActorType,
  useGetUnusedAccessActor
} from "@app/hooks/api/secretInsights";

import { ACTOR_TYPE_CONFIG } from "./unusedAccessHelpers";

// Rows shown per environment before "N more" opens the rest.
const PREVIEW_ROWS = 5;

type SecretsProps = {
  data: TGetUnusedAccessActorResponse;
};

const ActorSecrets = ({ data }: SecretsProps) => {
  const { currentProject, projectId } = useProject();
  const { orgId } = useParams({ strict: false });
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const environmentNames = new Map(currentProject.environments.map((env) => [env.slug, env.name]));
  // The list stops at 200, leaves out what the viewer cannot see, and drops secrets deleted since the computation.
  const unlistedCount = Math.max(0, data.actor.unusedSecretCount - data.secrets.length);
  const byEnvironment = new Map<string, Map<string, typeof data.secrets>>();
  data.secrets.forEach((secret) => {
    const byPath = byEnvironment.get(secret.environment) ?? new Map<string, typeof data.secrets>();
    byPath.set(secret.secretPath, [...(byPath.get(secret.secretPath) ?? []), secret]);
    byEnvironment.set(secret.environment, byPath);
  });

  if (data.secrets.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>Nothing to show</EmptyTitle>
          <EmptyDescription>
            {unlistedCount > 0
              ? "Its unread secrets are in places you cannot see, or were deleted since the last update."
              : "It has no unread secrets anymore."}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {[...byEnvironment.entries()].map(([environment, byPath]) => {
        const total = [...byPath.values()].reduce((sum, secrets) => sum + secrets.length, 0);
        let remaining = expanded.has(environment) ? total : PREVIEW_ROWS;
        const groups = [...byPath.entries()].flatMap(([secretPath, secrets]) => {
          const shown = secrets.slice(0, remaining);
          remaining -= shown.length;
          return shown.length > 0 ? [{ secretPath, secrets, shown }] : [];
        });
        const hidden = total - groups.reduce((sum, group) => sum + group.shown.length, 0);
        return (
          <div key={environment} className="flex flex-col gap-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead colSpan={2} className="h-9">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm text-foreground">
                        {environmentNames.get(environment) ?? environment}
                      </span>
                      <span className="text-xs text-muted">{total} unused</span>
                    </div>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map(({ secretPath, secrets, shown }) => [
                  <TableRow
                    key={`path:${secretPath}`}
                    className="bg-foreground/[0.03] hover:bg-foreground/[0.03]"
                  >
                    <TableCell colSpan={2} isTruncatable className="h-8">
                      <div className="flex items-center gap-2">
                        <FolderIcon className="size-3.5 shrink-0 text-folder" />
                        <span className="truncate text-xs">{secretPath}</span>
                        <span className="shrink-0 text-xs text-muted">{secrets.length}</span>
                      </div>
                    </TableCell>
                  </TableRow>,
                  ...shown.map((secret) => (
                    <TableRow
                      key={`secret:${secretPath}/${secret.secretKey}`}
                      className="group/row"
                    >
                      <TableCell isTruncatable className="max-w-64 pl-8">
                        <div className="flex items-center gap-2">
                          <KeyIcon className="size-4 shrink-0 text-muted" />
                          <span className="truncate font-mono">{secret.secretKey}</span>
                        </div>
                      </TableCell>
                      <TableCell variant="action">
                        <GoToSecretButton
                          orgId={orgId as string}
                          projectId={projectId}
                          secretKey={secret.secretKey}
                          secretPath={secretPath}
                          environmentSlug={environment}
                          isProjectMember
                        />
                      </TableCell>
                    </TableRow>
                  ))
                ])}
              </TableBody>
            </Table>
            {hidden > 0 && (
              <Button
                variant="ghost"
                size="xs"
                className="self-start"
                onClick={() => setExpanded((previous) => new Set(previous).add(environment))}
              >
                {hidden} more
              </Button>
            )}
          </div>
        );
      })}
      {unlistedCount > 0 && (
        <p className="text-xs text-muted">
          {unlistedCount} more unread {unlistedCount === 1 ? "secret is" : "secrets are"} not
          listed: past the first 200, in places you cannot see, or deleted since the last update.
        </p>
      )}
    </div>
  );
};

type Props = {
  actor: TUnusedAccessActor | null;
  onClose: () => void;
};

export const UnusedAccessActorSheet = ({ actor, onClose }: Props) => {
  const { projectId } = useProject();
  const { data, isPending, error } = useGetUnusedAccessActor(
    {
      projectId,
      actorType: actor?.actorType ?? UnusedAccessActorType.User,
      actorId: actor?.actorId ?? ""
    },
    { enabled: Boolean(actor) }
  );

  // The fetched counts are newer than the card row, which can come from an older cached result.
  const header = data?.actor ?? actor;

  const renderBody = () => {
    if (!actor) return null;
    if (isPending) return <Skeleton className="h-48 w-full" />;
    if (!data) {
      return (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>Could not load unused secrets</EmptyTitle>
            <EmptyDescription>
              {(axios.isAxiosError(error) &&
                (error.response?.data as { message?: string })?.message) ||
                "Try again in a moment."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      );
    }
    return <ActorSecrets key={`${actor.actorType}-${actor.actorId}`} data={data} />;
  };

  return (
    <Sheet
      open={actor !== null}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <SheetContent size="form" side="right" onOpenAutoFocus={(event) => event.preventDefault()}>
        {header && (
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <span className="truncate">{header.name}</span>
              <Badge variant="neutral">{ACTOR_TYPE_CONFIG[header.actorType].label}</Badge>
            </SheetTitle>
            <SheetDescription>
              Has not read {header.unusedSecretCount} of the {header.accessibleSecretCount}{" "}
              {header.accessibleSecretCount === 1 ? "secret" : "secrets"} it can access in the last
              30 days.
            </SheetDescription>
          </SheetHeader>
        )}
        <div className="flex thin-scrollbar flex-col overflow-y-auto p-4">{renderBody()}</div>
      </SheetContent>
    </Sheet>
  );
};
