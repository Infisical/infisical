import { useState } from "react";
import { Badge } from "@infisical/cipher/ui/badge";
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

import { failed } from "../../../../access/toast";
import { useV4Adapter } from "../../../../data/adapters";
import { nameLabel } from "../../../../shell/resource-name";
import type { Resource } from "../../secrets-model";
import { environmentLabel } from "../flows/shared";
import { useLastDefined } from "../use-last-defined";

type ImportResource = Extract<Resource, { kind: "import" }>;

const movedTo = (before: ImportResource[], after: ImportResource[]) => {
  const changed = before.flatMap((item, index) => (item.id === after[index].id ? [] : [index]));
  if (!changed.length) return undefined;
  const first = changed[0];
  const last = changed[changed.length - 1];
  return after[last].id === before[first].id
    ? { moved: before[first], to: last }
    : { moved: before[last], to: first };
};

export function ReorderImportsSheet({
  entry: openEntry,
  resources,
  onClose
}: {
  entry?: ImportResource;
  resources: readonly Resource[];
  onClose: () => void;
}) {
  const entry = useLastDefined(openEntry);
  const updateImport = useV4Adapter("secrets").useUpdateSecretImport();
  const [draft, setDraft] = useState<{ basis: string; order: ImportResource[] }>();
  const [saving, setSaving] = useState(false);
  if (!entry) return null;

  const stored = resources
    .filter(
      (resource): resource is ImportResource =>
        resource.kind === "import" &&
        resource.project === entry.project &&
        resource.environment === entry.environment &&
        resource.path === entry.path
    )
    .sort((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity));
  const basis = stored.map((item) => `${item.id}:${item.position}`).join(",");
  const awaitingServer = draft?.basis === basis;
  const items = awaitingServer ? draft.order : stored;

  const reorder = async (next: ImportResource[]) => {
    const move = movedTo(items, next);
    const position = move && items[move.to].position;
    if (!move || position === undefined) return;
    setDraft({ basis, order: next });
    setSaving(true);
    try {
      await updateImport.mutateAsync({
        projectId: entry.project,
        environment: entry.environment,
        path: entry.path,
        id: move.moved.id,
        import: { position }
      });
    } catch (error) {
      setDraft(undefined);
      failed("Failed to reorder secret imports", error);
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
          <SortableList
            label="Secret imports"
            items={items}
            getKey={(item) => item.id}
            getLabel={(item) => item.source.path}
            disabled={saving || awaitingServer}
            onReorder={reorder}
            renderItem={(item, { index }) => (
              <Stack gap={2}>
                <Inline gap={8} align="center" wrap={false}>
                  <Text truncate>{item.source.path}</Text>
                  {index === items.length - 1 && items.length > 1 && (
                    <Badge tone="soft">Wins on conflict</Badge>
                  )}
                </Inline>
                <SmallText muted truncate>
                  {item.source.project !== entry.project && (
                    <>
                      {nameLabel(
                        { id: item.source.project, name: item.sourceProjectName, pending: false },
                        "project"
                      )}{" "}
                    </>
                  )}
                  {environmentLabel(item.source.environment)}
                </SmallText>
              </Stack>
            )}
          />
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
