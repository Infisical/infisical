import { useState } from "react";
import { TagsIcon } from "lucide-react";

import { Button } from "@app/components/v4/ui/button";
import { Combobox } from "@app/components/v4/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v4/ui/dialog";
import { Field } from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import { Switch } from "@app/components/v4/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v4/ui/table";
import { slugSchema } from "@app/lib/schemas/slugSchema";

import type { Secret } from "../../secrets-model";
import { LOCAL_ONLY } from "../flows/shared";
import { KindIcon } from "../overview-cells";
import type { OverlayHostProps } from "../row-actions/types";

import styles from "./bulk-dialogs.module.css";

type Props = OverlayHostProps & { targets?: Secret[]; onCompleted?: () => void };

function BulkTagDialogContent({
  open,
  targets,
  scope,
  resources,
  onClose,
  onApply,
  onCompleted
}: Props & { targets: Secret[]; open: boolean }) {
  const [tags, setTags] = useState<string[]>([]);
  const [createdTags, setCreatedTags] = useState<string[]>([]);
  const [isReplaceMode, setIsReplaceMode] = useState(false);
  const [createError, setCreateError] = useState<string>();

  const projectTags = [
    ...new Set(
      resources.flatMap((resource) =>
        resource.kind === "secret" && resource.project === scope.project ? resource.tags : []
      )
    )
  ];
  const tagOptions = [...new Set([...projectTags, ...createdTags])]
    .sort()
    .map((tag) => ({ value: tag, label: tag }));

  const selectedResources = [...new Set(targets.map(({ name }) => name))].map((name) => ({
    name,
    envSlugs: new Set(targets.filter((secret) => secret.name === name).map((s) => s.environment))
  }));
  const selectedSecretCount = selectedResources.length;

  const handleCreateTag = (inputValue: string) => {
    const parsedSlug = slugSchema().safeParse(inputValue);
    if (!parsedSlug.success) {
      setCreateError("Tag must be slug-friendly");
      return;
    }
    if (projectTags.includes(parsedSlug.data)) {
      setCreateError("Tag already exists");
      return;
    }
    setCreateError(undefined);
    setCreatedTags((current) => [...current, parsedSlug.data]);
    setTags((current) => [...new Set([...current, parsedSlug.data])]);
  };

  const onSubmit = () => {
    if (!tags.length) return;
    const ids = new Set(targets.map(({ id }) => id));
    onApply(
      (current) =>
        current.map((resource) => {
          if (resource.kind !== "secret" || !ids.has(resource.id)) return resource;
          return {
            ...resource,
            tags: isReplaceMode ? [...tags] : [...new Set([...resource.tags, ...tags])],
            updatedAt: new Date().toISOString()
          };
        }),
      { title: "Successfully updated tags on selected secrets", description: LOCAL_ONLY }
    );
    onClose();
    onCompleted?.();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className={styles.tagDialog}>
        <DialogHeader>
          <DialogTitle>Bulk tag secrets</DialogTitle>
          <DialogDescription>
            {`Apply tags to ${selectedSecretCount} selected secret${selectedSecretCount !== 1 ? "s" : ""} across all environments.`}
          </DialogDescription>
        </DialogHeader>
        <form
          id="bulk-tag-dialog"
          noValidate
          className={styles.stack}
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          {selectedResources.length > 0 && (
            <div className={styles.selection}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className={styles.typeColumn}>Type</TableHead>
                    <TableHead>Name</TableHead>
                    {scope.visibleEnvironments.map((environment) => (
                      <TableHead key={environment.value} className={styles.envColumn}>
                        {environment.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedResources.map(({ name, envSlugs }) => (
                    <TableRow key={name}>
                      <TableCell>
                        <span className={styles.kind}>
                          <KindIcon kind="secret" />
                        </span>
                      </TableCell>
                      <TableCell className={styles.nameCell} title={name}>
                        {name}
                      </TableCell>
                      {scope.visibleEnvironments.map((environment) => (
                        <TableCell key={environment.value} className={styles.envColumn}>
                          {envSlugs.has(environment.value) ? (
                            <span className={styles.tagged}>
                              <Icon icon={TagsIcon} label="Will be tagged" />
                            </span>
                          ) : (
                            <span className={styles.missing}>
                              <Icon name="minus" label="Not in this environment" />
                            </span>
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <Field label="Tags" error={createError}>
            <Combobox
              multiple
              label="Tags"
              options={tagOptions}
              value={tags}
              placeholder="Select or create tags..."
              emptyText="No tags match search"
              invalid={Boolean(createError)}
              onValueChange={(value) => {
                setTags(value);
                setCreateError(undefined);
              }}
              onCreate={handleCreateTag}
            />
          </Field>
          <Switch
            checked={isReplaceMode}
            onCheckedChange={setIsReplaceMode}
            label="Replace existing tags"
            description={
              isReplaceMode
                ? "All existing tags on selected secrets will be removed and replaced with the tags selected above."
                : "Selected tags will be added to each secret, keeping any existing tags."
            }
          />
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="bulk-tag-dialog" disabled={!tags.length}>
            Apply tags
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BulkTagDialog(props: Props) {
  const { targets } = props;
  const [last, setLast] = useState(targets);
  const [session, setSession] = useState(0);
  if (targets && targets !== last) {
    setLast(targets);
    setSession(session + 1);
  }
  if (!last) return null;
  return <BulkTagDialogContent key={session} {...props} targets={last} open={Boolean(targets)} />;
}
