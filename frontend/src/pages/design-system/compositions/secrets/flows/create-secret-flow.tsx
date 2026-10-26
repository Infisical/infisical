import { type ClipboardEvent, useMemo, useRef, useState } from "react";

import { parsePastedEnv } from "@app/components/utilities/parseSecrets";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@app/components/v4/ui/accordion";
import { Button } from "@app/components/v4/ui/button";
import { Field, FieldError, FieldLabel } from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { MultiSelect } from "@app/components/v4/ui/multi-select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v4/ui/sheet";
import { Switch } from "@app/components/v4/ui/switch";
import { SmallText } from "@app/components/v4/ui/text";
import { Textarea } from "@app/components/v4/ui/textarea";
import { Tooltip } from "@app/components/v4/ui/tooltip";
import { getKeyValue } from "@app/helpers/parseEnvVar";
import { slugSchema } from "@app/lib/schemas/slugSchema";

import { NEXT_PHASE } from "../overview-cells";
import {
  DiscardDialog,
  environmentLabel,
  folderExists,
  Gate,
  LOCAL_ONLY,
  secretsAt
} from "./shared";
import type { AddFlowProps, NewResource } from "./types";

import styles from "./flows.module.css";

type Metadata = { id: string; key: string; value: string; isEncrypted: boolean };
type Entry = {
  id: string;
  key: string;
  value: string;
  comment: string;
  skipMultilineEncoding: boolean;
  tags: string[];
  metadata: Metadata[];
};

const blankEntry = (key = ""): Entry => ({
  id: crypto.randomUUID(),
  key,
  value: "",
  comment: "",
  skipMultilineEncoding: false,
  tags: [],
  metadata: []
});

export function CreateSecretFlow({
  open,
  onOpenChange,
  scope,
  resources,
  initial,
  onCreate,
  onError
}: AddFlowProps) {
  const { project, path } = scope;
  const [selected, setSelected] = useState(
    () => initial?.environments ?? scope.visibleEnvironments.map((environment) => environment.value)
  );
  const [entries, setEntries] = useState(() => [blankEntry(initial?.name)]);
  const [createdTags, setCreatedTags] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [discard, setDiscard] = useState(false);
  const pristine = useRef(JSON.stringify({ selected, entries }));
  const keyInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const dirty = JSON.stringify({ selected, entries }) !== pristine.current;
  const tagOptions = useMemo(
    () =>
      [
        ...new Set([
          ...resources.flatMap((resource) =>
            resource.kind === "secret" && resource.project === project ? resource.tags : []
          ),
          ...createdTags
        ])
      ]
        .sort()
        .map((tag) => ({ value: tag, label: tag })),
    [resources, project, createdTags]
  );

  const patch = (id: string, value: Partial<Entry>) =>
    setEntries((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, ...value } : entry))
    );
  const clearError = (key: string) =>
    setErrors((current) => {
      if (!(key in current)) return current;
      const rest = { ...current };
      delete rest[key];
      return rest;
    });
  const close = () => {
    if (dirty) setDiscard(true);
    else onOpenChange(false);
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>, entry: Entry) => {
    const content = event.clipboardData.getData("text");
    const { key, value } = getKeyValue(content, [":", "="]);
    const whole =
      event.currentTarget.selectionStart === 0 &&
      event.currentTarget.selectionEnd === event.currentTarget.value.length;
    if (entry.key && !whole) return;
    event.preventDefault();
    const parsed = Object.entries(parsePastedEnv(content));
    if (parsed.length > 1) {
      const [first, ...rest] = parsed.map(([parsedKey, parsedValue]) => ({
        ...blankEntry(parsedKey),
        value: parsedValue.value,
        comment: parsedValue.comments.join("\n")
      }));
      setEntries((current) => [
        ...current.map((item) => (item.id === entry.id ? { ...first, id: entry.id } : item)),
        ...rest
      ]);
      return;
    }
    patch(entry.id, value ? { key, value } : { key });
  };

  const toSecret = (entry: Entry, environment: string): NewResource => ({
    kind: "secret",
    project,
    environment,
    path,
    name: entry.key.trim(),
    value: { status: "present", value: entry.value },
    comment: entry.comment,
    tags: entry.tags,
    metadata: entry.metadata
      .filter((item) => item.key && item.value)
      .map(({ key, value, isEncrypted }) => ({ key, value, encrypted: isEncrypted })),
    version: 1,
    ...(entry.skipMultilineEncoding ? { skipMultilineEncoding: true } : {})
  });
  const folderFor = (environment: string): NewResource[] => {
    if (folderExists(resources, project, environment, path)) return [];
    const segments = path.split("/").filter(Boolean);
    return [
      {
        kind: "folder",
        project,
        environment,
        path: `/${segments.slice(0, -1).join("/")}`,
        name: segments.at(-1) ?? "",
        description: ""
      }
    ];
  };
  const exists = (environment: string, key: string) =>
    secretsAt(resources, project, environment, path).some((secret) => secret.name === key);

  const submit = () => {
    const issues: Record<string, string> = {};
    if (!selected.length) issues.environments = "Required";
    const seen = new Set<string>();
    entries.forEach((entry) => {
      const key = entry.key.trim();
      if (!key) issues[`${entry.id}.key`] = "Key is required";
      else if (seen.has(key)) issues[`${entry.id}.key`] = "Key must be unique";
      seen.add(key);
      entry.metadata.forEach((item) => {
        if (!item.key) issues[`${entry.id}.metadata.${item.id}`] = "Key is required";
      });
    });
    setErrors(issues);
    if (Object.keys(issues).length) return;

    if (selected.length === 1 && entries.length > 1) {
      const [environment] = selected;
      const taken = entries
        .map((entry) => entry.key.trim())
        .filter((key) => exists(environment, key));
      if (taken.length) {
        onError({
          title: "Secrets were not created",
          description: `${taken.join(", ")} already ${taken.length > 1 ? "exist" : "exists"} in ${environmentLabel(environment)}. No secrets were created in local demo data.`
        });
        return;
      }
      onCreate(
        [...folderFor(environment), ...entries.map((entry) => toSecret(entry, environment))],
        { title: `${entries.length} secrets created`, description: LOCAL_ONLY }
      );
      onOpenChange(false);
      return;
    }

    const created: NewResource[] = [];
    const failed: string[] = [];
    const updated = new Set<string>();
    selected.forEach((environment) => {
      const additions = entries.filter((entry) => {
        if (!exists(environment, entry.key.trim())) return true;
        failed.push(`${entry.key.trim()} already exists in ${environmentLabel(environment)}.`);
        return false;
      });
      if (!additions.length) return;
      updated.add(environment);
      created.push(
        ...folderFor(environment),
        ...additions.map((entry) => toSecret(entry, environment))
      );
    });
    if (updated.size)
      onCreate(created, {
        title: `Secrets created in ${updated.size > 1 ? "environments" : "environment"}: ${[...updated].join(", ")}`,
        description: LOCAL_ONLY
      });
    if (failed.length) {
      onError({ title: "Some secrets were not created", description: failed.join(" ") });
      return;
    }
    onOpenChange(false);
  };

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next) close();
        }}
      >
        <SheetContent
          className={styles.secretSheet}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            keyInputs.current[entries[0].id]?.focus();
          }}
        >
          <SheetHeader>
            <SheetTitle>Create secret</SheetTitle>
          </SheetHeader>
          <SheetBody>
            {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
            <form
              id="create-secret-flow"
              noValidate
              className={styles.form}
              onSubmit={(event) => {
                event.preventDefault();
                submit();
              }}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  submit();
                }
              }}
            >
              <Field label="Environments" error={errors.environments}>
                <MultiSelect
                  label="Environments"
                  options={scope.environments}
                  value={selected}
                  placeholder="Select environments to create secret in..."
                  invalid={Boolean(errors.environments)}
                  searchable
                  onChange={(value) => {
                    setSelected(value);
                    clearError("environments");
                  }}
                />
              </Field>
              {entries.map((entry, index) => {
                const keyError = errors[`${entry.id}.key`];
                const spaced = entry.key.trim().includes(" ");
                return (
                  <div
                    key={entry.id}
                    className={styles.entry}
                    data-framed={entries.length > 1 || undefined}
                  >
                    <div className={styles.entryHead}>
                      <Field label="Key" error={keyError} className={styles.grow}>
                        <Input
                          ref={(element) => {
                            keyInputs.current[entry.id] = element;
                          }}
                          value={entry.key}
                          placeholder="Type your secret name"
                          autoComplete="off"
                          spellCheck={false}
                          invalid={Boolean(keyError)}
                          onPaste={(event) => handlePaste(event, entry)}
                          onChange={(event) => {
                            patch(entry.id, { key: event.target.value });
                            clearError(`${entry.id}.key`);
                          }}
                          trailing={
                            <span className={styles.warnSlot}>
                              {spaced && (
                                <Tooltip
                                  content={`Secret key contains whitespaces. If this is the desired format, you need to provide it as ${encodeURIComponent(entry.key.trim())} when making API requests.`}
                                >
                                  <span className={styles.warnMark}>
                                    <Icon name="alert" label="Secret key contains whitespaces" />
                                  </span>
                                </Tooltip>
                              )}
                            </span>
                          }
                        />
                      </Field>
                      {entries.length > 1 && (
                        <span className={styles.entryRemove}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            icon="trash"
                            iconOnly
                            onClick={() =>
                              setEntries((current) =>
                                current.filter((item) => item.id !== entry.id)
                              )
                            }
                          >
                            {`Remove secret ${index + 1}`}
                          </Button>
                        </span>
                      )}
                    </div>
                    <div className={styles.valueField}>
                      <div className={styles.labelRow}>
                        <FieldLabel htmlFor={`${entry.id}-value`}>Value</FieldLabel>
                        <Tooltip
                          content={
                            <>
                              You can add references to other secrets using the format{" "}
                              <code className={styles.mono}>${"{secret_name}"}</code>
                            </>
                          }
                        >
                          <span className={styles.hint}>
                            <Icon name="info" size={14} label="About secret references" />
                          </span>
                        </Tooltip>
                        <span className={styles.push}>
                          <Gate reason={NEXT_PHASE}>
                            <Button type="button" variant="ghost" size="xs" disabled>
                              Generate
                            </Button>
                          </Gate>
                        </span>
                      </div>
                      <Textarea
                        id={`${entry.id}-value`}
                        className={styles.mono}
                        value={entry.value}
                        placeholder="Enter secret value..."
                        autoComplete="off"
                        spellCheck={false}
                        onChange={(event) => patch(entry.id, { value: event.target.value })}
                      />
                    </div>
                    <Field label="Comment">
                      <Textarea
                        value={entry.comment}
                        placeholder="Add a comment for this secret..."
                        onChange={(event) => patch(entry.id, { comment: event.target.value })}
                      />
                    </Field>
                    <Accordion type="single" collapsible>
                      <AccordionItem value="advanced">
                        <AccordionTrigger>Advanced options</AccordionTrigger>
                        <AccordionContent>
                          <Stack gap={16}>
                            <Field label="Tags">
                              <MultiSelect
                                label="Tags"
                                options={tagOptions}
                                value={entry.tags}
                                placeholder="Select tags to assign to secret..."
                                searchable
                                onChange={(value) => patch(entry.id, { tags: value })}
                                onCreate={(query) => {
                                  const parsed = slugSchema().safeParse(query.trim());
                                  if (!parsed.success) return;
                                  setCreatedTags((current) => [...current, parsed.data]);
                                  patch(entry.id, { tags: [...entry.tags, parsed.data] });
                                }}
                              />
                            </Field>
                            <div className={styles.switchRow}>
                              <span className={styles.labelRow}>
                                <FieldLabel htmlFor={`${entry.id}-multiline`}>
                                  Enable multiline encoding
                                </FieldLabel>
                                <Tooltip content="When enabled, newlines in secret values are escaped as \n for environment variable output.">
                                  <span className={styles.hint}>
                                    <Icon name="info" size={14} label="About multiline encoding" />
                                  </span>
                                </Tooltip>
                              </span>
                              <Switch
                                id={`${entry.id}-multiline`}
                                checked={entry.skipMultilineEncoding}
                                onCheckedChange={(checked) =>
                                  patch(entry.id, { skipMultilineEncoding: checked })
                                }
                              />
                            </div>
                            <Field
                              label="Metadata"
                              description="Encrypted Metadata will not be searchable via the UI or API."
                              group
                            >
                              <div className={styles.metadata}>
                                {entry.metadata.length === 0 && (
                                  <SmallText muted className={styles.emptyNote}>
                                    No metadata entries.
                                  </SmallText>
                                )}
                                {entry.metadata.map((item, itemIndex) => {
                                  const itemError = errors[`${entry.id}.metadata.${item.id}`];
                                  const update = (value: Partial<Metadata>) =>
                                    patch(entry.id, {
                                      metadata: entry.metadata.map((current) =>
                                        current.id === item.id ? { ...current, ...value } : current
                                      )
                                    });
                                  return (
                                    <div key={item.id} className={styles.metadataRow}>
                                      <div className={styles.grow}>
                                        <Input
                                          aria-label={`Metadata key ${itemIndex + 1}`}
                                          value={item.key}
                                          placeholder="Enter key"
                                          invalid={Boolean(itemError)}
                                          onChange={(event) => {
                                            update({ key: event.target.value });
                                            clearError(`${entry.id}.metadata.${item.id}`);
                                          }}
                                        />
                                        {itemError && <FieldError>{itemError}</FieldError>}
                                      </div>
                                      <Input
                                        aria-label={`Metadata value ${itemIndex + 1}`}
                                        className={styles.grow}
                                        value={item.value}
                                        placeholder="Enter value"
                                        onChange={(event) => update({ value: event.target.value })}
                                      />
                                      <Tooltip content="Encrypt">
                                        <span className={styles.metadataSwitch}>
                                          <Switch
                                            aria-label={`Encrypt metadata entry ${itemIndex + 1}`}
                                            checked={item.isEncrypted}
                                            onCheckedChange={(checked) =>
                                              update({ isEncrypted: checked })
                                            }
                                          />
                                        </span>
                                      </Tooltip>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-sm"
                                        icon="trash"
                                        iconOnly
                                        onClick={() =>
                                          patch(entry.id, {
                                            metadata: entry.metadata.filter(
                                              (current) => current.id !== item.id
                                            )
                                          })
                                        }
                                      >
                                        {`Remove metadata entry ${itemIndex + 1}`}
                                      </Button>
                                    </div>
                                  );
                                })}
                                <span
                                  className={styles.metadataAdd}
                                  data-empty={!entry.metadata.length || undefined}
                                >
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="xs"
                                    icon="plus"
                                    onClick={() =>
                                      patch(entry.id, {
                                        metadata: [
                                          ...entry.metadata,
                                          {
                                            id: crypto.randomUUID(),
                                            key: "",
                                            value: "",
                                            isEncrypted: false
                                          }
                                        ]
                                      })
                                    }
                                  >
                                    Add entry
                                  </Button>
                                </span>
                              </div>
                            </Field>
                          </Stack>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </div>
                );
              })}
              <Button
                type="button"
                variant="outline"
                icon="plus"
                onClick={() => {
                  const next = blankEntry();
                  setEntries((current) => [...current, next]);
                  setTimeout(() => keyInputs.current[next.id]?.focus(), 0);
                }}
              >
                Add more
              </Button>
            </form>
          </SheetBody>
          <SheetFooter>
            <Inline justify="between">
              <Gate reason={NEXT_PHASE}>
                <Button type="button" variant="outline" icon="upload" disabled>
                  Upload
                </Button>
              </Gate>
              <Inline gap={8}>
                <Button type="button" variant="ghost" onClick={close}>
                  Cancel
                </Button>
                <Button type="submit" form="create-secret-flow">
                  Create
                </Button>
              </Inline>
            </Inline>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <DiscardDialog
        open={discard}
        onKeep={() => setDiscard(false)}
        onDiscard={() => {
          setDiscard(false);
          onOpenChange(false);
        }}
      />
    </>
  );
}
