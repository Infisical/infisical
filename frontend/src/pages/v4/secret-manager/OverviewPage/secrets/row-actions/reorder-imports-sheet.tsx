import { useState } from "react";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@infisical/cipher/ui/sheet";
import { SortableList } from "@infisical/cipher/ui/sortable-list";
import { SmallText, Text } from "@infisical/cipher/ui/text";

import type { TSecretImport } from "@app/hooks/api/secretImports/types";

import { errorMessage, failed } from "../../../../access/toast";
import { useV4Adapter } from "../../../../data/adapters";
import { nameLabel } from "../../../../shell/resource-name";
import type { Resource } from "../../secrets-model";
import { environmentLabel } from "../flows/shared";
import { useLastDefined } from "../use-last-defined";

type ImportResource = Extract<Resource, { kind: "import" }>;

const movedTo = (before: TSecretImport[], after: TSecretImport[]) => {
  const changed = before.flatMap((item, index) => (item.id === after[index].id ? [] : [index]));
  if (!changed.length) return undefined;
  const first = changed[0];
  const last = changed[changed.length - 1];
  if (last - first === 1)
    return before[first].isReplication && !before[last].isReplication
      ? { moved: before[first], to: last }
      : { moved: before[last], to: first };
  return after[last].id === before[first].id
    ? { moved: before[first], to: last }
    : { moved: before[last], to: first };
};

export function ReorderImportsSheet({
  entry: openEntry,
  onClose
}: {
  entry?: ImportResource;
  onClose: () => void;
}) {
  const entry = useLastDefined(openEntry);
  const adapter = useV4Adapter("secrets");
  const updateImport = adapter.useUpdateSecretImport();
  const { data, isPending, error, refetch } = adapter.useSecretImports({
    projectId: entry?.project ?? "",
    environment: entry?.environment ?? "",
    path: entry?.path ?? "/",
    enabled: Boolean(openEntry)
  });
  const [draft, setDraft] = useState<{ basis: string; order: TSecretImport[] }>();
  const [saving, setSaving] = useState(false);
  if (!entry) return null;

  const stored = (data ?? [])
    .filter((item) => !item.isReserved)
    .sort((a, b) => Number(a.position) - Number(b.position));
  const basis = stored.map((item) => `${item.id}:${item.position}`).join(",");
  const awaitingServer = draft?.basis === basis;
  const items = awaitingServer ? draft.order : stored;

  const reorder = async (next: TSecretImport[]) => {
    const move = movedTo(items, next);
    if (!move) return;
    const target = items[move.to];
    const twin =
      move.to > items.indexOf(move.moved) && target.isReplication
        ? data?.find(
            (item) =>
              item.isReserved && item.importPath.endsWith(`/__reserve_replication_${target.id}`)
          )
        : undefined;
    setDraft({ basis, order: next });
    setSaving(true);
    try {
      await updateImport.mutateAsync({
        projectId: entry.project,
        environment: entry.environment,
        path: entry.path,
        id: move.moved.id,
        import: { position: Number((twin ?? target).position) }
      });
    } catch (saveError) {
      setDraft(undefined);
      failed("Failed to reorder secret imports", saveError);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={Boolean(openEntry)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Reorder imports</SheetTitle>
          <SheetDescription>
            {`${environmentLabel(entry.environment)}, ${entry.path}`}
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          {error ? (
            <EmptyState
              size="sm"
              icon="alert-c"
              title="Couldn't load secret imports"
              description={errorMessage(error) ?? "Try again in a moment."}
              actions={
                <Button variant="outline" onClick={() => refetch()}>
                  Retry
                </Button>
              }
            />
          ) : (
            <SortableList
              label="Secret imports"
              items={items}
              getKey={(item) => item.id}
              getLabel={(item) => item.importPath}
              disabled={isPending || saving || awaitingServer}
              onReorder={reorder}
              renderItem={(item, { index }) => (
                <Stack gap={2}>
                  <Inline gap={8} align="center" wrap={false}>
                    <Text truncate>{item.importPath}</Text>
                    {index === items.length - 1 && items.length > 1 && (
                      <Badge tone="soft">Wins on conflict</Badge>
                    )}
                  </Inline>
                  <SmallText muted truncate>
                    {item.importEnv.projectId && item.importEnv.projectId !== entry.project && (
                      <>
                        {nameLabel(
                          {
                            id: item.importEnv.projectId,
                            name: item.sourceProjectName,
                            pending: false
                          },
                          "project"
                        )}{" "}
                      </>
                    )}
                    {environmentLabel(item.importEnv.slug)}
                  </SmallText>
                </Stack>
              )}
            />
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
