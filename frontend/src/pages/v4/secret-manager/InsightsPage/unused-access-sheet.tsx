import { useState } from "react";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { DataTable, type DataTableGroup } from "@infisical/cipher/ui/data-table";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { RowLink } from "@infisical/cipher/ui/row-link";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@infisical/cipher/ui/sheet";
import { Skeleton } from "@infisical/cipher/ui/skeleton";
import { Heading, Meta, SmallText } from "@infisical/cipher/ui/text";

import {
  type TGetUnusedAccessActorResponse,
  type TUnusedAccessActor,
  type TUnusedSecret,
  UnusedAccessActorType
} from "@app/hooks/api/secretInsights/types";

import { errorMessage } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { overviewLink } from "./insights.utils";
import { ACTOR_TYPE } from "./unused-access.utils";

const PREVIEW_ROWS = 5;

const ActorSecrets = ({
  orgId,
  projectId,
  data,
  environmentName
}: {
  orgId: string;
  projectId: string;
  data: TGetUnusedAccessActorResponse;
  environmentName: (slug: string) => string;
}) => {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  // The list stops at 200, leaves out what the viewer cannot see, and drops secrets deleted since the computation.
  const unlistedCount = Math.max(0, data.actor.unusedSecretCount - data.secrets.length);
  const byEnvironment = new Map<string, Map<string, TUnusedSecret[]>>();
  data.secrets.forEach((secret) => {
    const byPath = byEnvironment.get(secret.environment) ?? new Map<string, TUnusedSecret[]>();
    byPath.set(secret.secretPath, [...(byPath.get(secret.secretPath) ?? []), secret]);
    byEnvironment.set(secret.environment, byPath);
  });

  if (data.secrets.length === 0)
    return (
      <EmptyState
        size="sm"
        icon="check-c"
        title="Nothing to show"
        description={
          unlistedCount > 0
            ? "Its unread secrets are in places you can't see, or were deleted since the last update."
            : "It has no unread secrets anymore."
        }
      />
    );

  return (
    <Stack gap={24}>
      {[...byEnvironment.entries()].map(([environment, byPath]) => {
        const total = [...byPath.values()].reduce((sum, secrets) => sum + secrets.length, 0);
        let remaining = expanded.has(environment) ? total : PREVIEW_ROWS;
        const groups: DataTableGroup<TUnusedSecret>[] = [...byPath.entries()].flatMap(
          ([secretPath, secrets]) => {
            const shown = secrets.slice(0, remaining);
            remaining -= shown.length;
            return shown.length
              ? [
                  {
                    id: secretPath,
                    label: (
                      <Meta mono truncate>
                        {secretPath}
                      </Meta>
                    ),
                    name: secretPath,
                    meta: secrets.length,
                    rows: shown
                  }
                ]
              : [];
          }
        );
        const hidden = total - groups.reduce((sum, group) => sum + group.rows.length, 0);
        return (
          <Stack key={environment} gap={8}>
            <Inline gap={8} align="baseline">
              <Heading level={3} size="subsection">
                {environmentName(environment)}
              </Heading>
              <Meta>{total} unused</Meta>
            </Inline>
            <DataTable
              label={`Unused secrets in ${environmentName(environment)}`}
              groups={groups}
              columns={[
                {
                  id: "key",
                  header: "Secret",
                  primary: true,
                  grow: true,
                  mono: true,
                  text: (secret) => secret.secretKey,
                  render: (secret) => (
                    <RowLink
                      title={secret.secretKey}
                      link={overviewLink(orgId, projectId, {
                        secretPath: secret.secretPath,
                        environments: [secret.environment],
                        search: secret.secretKey
                      })}
                    >
                      {secret.secretKey}
                    </RowLink>
                  )
                }
              ]}
              getRowId={(secret) => `${secret.secretPath}/${secret.secretKey}`}
              rowLabel={(secret) => secret.secretKey}
            />
            {hidden > 0 && (
              <Inline>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setExpanded((previous) => new Set(previous).add(environment))}
                >
                  {hidden} more
                </Button>
              </Inline>
            )}
          </Stack>
        );
      })}
      {unlistedCount > 0 && (
        <SmallText muted>
          {unlistedCount} more unread {unlistedCount === 1 ? "secret is" : "secrets are"} not
          listed: past the first 200, in places you can&apos;t see, or deleted since the last
          update.
        </SmallText>
      )}
    </Stack>
  );
};

export const UnusedAccessSheet = ({
  orgId,
  projectId,
  actor,
  environmentName,
  onClose
}: {
  orgId: string;
  projectId: string;
  actor: TUnusedAccessActor | null;
  environmentName: (slug: string) => string;
  onClose: () => void;
}) => {
  const { data, isPending, error } = useV4Adapter("secretInsights").useUnusedAccessActor(
    {
      projectId,
      actorType: actor?.actorType ?? UnusedAccessActorType.User,
      actorId: actor?.actorId ?? ""
    },
    { enabled: Boolean(actor) }
  );
  // The fetched counts are newer than the card row, which can come from an older cached result.
  const header = data?.actor ?? actor;

  let body = null;
  if (actor && isPending) body = <Skeleton lines={6} height={32} />;
  else if (actor && !data)
    body = (
      <EmptyState
        size="sm"
        icon="alert-c"
        title="Couldn't load unused secrets"
        description={errorMessage(error) ?? "Try again in a moment."}
      />
    );
  else if (actor && data)
    body = (
      <ActorSecrets
        key={`${actor.actorType}-${actor.actorId}`}
        orgId={orgId}
        projectId={projectId}
        data={data}
        environmentName={environmentName}
      />
    );

  return (
    <Sheet open={actor !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent size="md">
        {header && (
          <SheetHeader>
            <SheetTitle>
              <Inline gap={8} align="center" wrap={false}>
                <span>{header.name}</span>
                <Badge tone="soft" icon={ACTOR_TYPE[header.actorType].icon}>
                  {ACTOR_TYPE[header.actorType].label}
                </Badge>
              </Inline>
            </SheetTitle>
            <SheetDescription>
              Hasn&apos;t read {header.unusedSecretCount} of the {header.accessibleSecretCount}{" "}
              {header.accessibleSecretCount === 1 ? "secret" : "secrets"} it can access in the last
              30 days.
            </SheetDescription>
          </SheetHeader>
        )}
        <SheetBody>{body}</SheetBody>
      </SheetContent>
    </Sheet>
  );
};
