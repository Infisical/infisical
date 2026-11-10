import { useState } from "react";

import { Button } from "@app/components/v4/ui/button";
import { Checkbox } from "@app/components/v4/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator
} from "@app/components/v4/ui/command";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v4/ui/dialog";
import { Field } from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Stack } from "@app/components/v4/ui/layout";
import { Popover, PopoverContent, PopoverTrigger } from "@app/components/v4/ui/popover";
import { Tooltip } from "@app/components/v4/ui/tooltip";
import {
  ProjectPermissionActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { slugSchema } from "@app/lib/schemas/slugSchema";

import { useProjectPermission } from "../../../access/permissions";
import { useV4Adapter } from "../../../data/adapters";
import type { EnvironmentOption } from "./overview-cells";

import styles from "./overview.module.css";

const slugOf = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

function AddEnvironmentDialog({
  projectId,
  open,
  onOpenChange,
  onCreated,
  report
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (slug: string) => void;
  report: (message: string, tone: "ok" | "bad") => void;
}) {
  const create = useV4Adapter("secrets").useCreateEnvironment();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugDirty, setSlugDirty] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; slug?: string; form?: string }>({});
  const close = (next: boolean) => {
    onOpenChange(next);
    if (next) return;
    setName("");
    setSlug("");
    setSlugDirty(false);
    setErrors({});
  };
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a new environment</DialogTitle>
        </DialogHeader>
        <form
          id="create-environment"
          onSubmit={async (event) => {
            event.preventDefault();
            const parsed = slugSchema({ max: 64 }).safeParse(slug);
            const next = {
              name: name.trim() ? undefined : "Enter an environment name",
              slug: parsed.success ? undefined : parsed.error.issues[0]?.message
            };
            setErrors(next);
            if (next.name || next.slug) return;
            try {
              const environment = await create.mutateAsync({
                projectId,
                name: name.trim(),
                slug: slug.trim()
              });
              report(`Created the ${environment.name} environment.`, "ok");
              onCreated(environment.slug);
              close(false);
            } catch (error) {
              setErrors({
                form:
                  error instanceof Error && error.message
                    ? error.message
                    : "Could not create the environment."
              });
            }
          }}
        >
          <Stack gap={16}>
            <Field label="Environment name" error={errors.name}>
              <Input
                autoComplete="off"
                placeholder="Staging"
                value={name}
                invalid={Boolean(errors.name)}
                onChange={(event) => {
                  setName(event.target.value);
                  if (!slugDirty) setSlug(slugOf(event.target.value));
                }}
              />
            </Field>
            <Field
              label="Environment slug"
              error={errors.slug}
              description="Used to reference this environment in the CLI and API."
            >
              <Input
                mono
                autoComplete="off"
                placeholder="staging"
                value={slug}
                invalid={Boolean(errors.slug)}
                onChange={(event) => {
                  setSlug(event.target.value);
                  setSlugDirty(true);
                }}
              />
            </Field>
            {errors.form && (
              <span role="alert" className={styles.fieldError}>
                {errors.form}
              </span>
            )}
          </Stack>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="create-environment"
            loading={create.isPending}
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EnvironmentPicker({
  projectId,
  environments,
  selected,
  disabled,
  onChange,
  onCreated,
  report
}: {
  projectId: string;
  environments: EnvironmentOption[];
  selected: string[];
  disabled?: boolean;
  onChange: (selected: string[]) => void;
  onCreated: () => void;
  report: (message: string, tone: "ok" | "bad") => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const { permission } = useProjectPermission(projectId);
  const canCreate = permission.can(
    ProjectPermissionActions.Create,
    ProjectPermissionSub.Environments
  );
  const changeOpen = (next: boolean) => {
    setOpen(next);
    if (!next) setQuery("");
  };
  const chosen = environments.filter((environment) => selected.includes(environment.value));
  let label = "All environments";
  if (chosen.length === 1) label = chosen[0].label;
  else if (chosen.length > 0 && chosen.length < environments.length)
    label = `${chosen.length} environments`;
  const switchTo = (value: string) => {
    onChange(selected.length === 1 && selected[0] === value ? [] : [value]);
    changeOpen(false);
  };
  const toggle = (value: string) =>
    onChange(
      selected.includes(value)
        ? selected.filter((entry) => entry !== value)
        : environments
            .map((environment) => environment.value)
            .filter((entry) => entry === value || selected.includes(entry))
    );
  return (
    <>
      <Popover open={open} onOpenChange={changeOpen}>
        <PopoverTrigger asChild>
          <Button
            layout="trigger"
            variant="outline"

            className={styles.envTrigger}
            aria-label={`Environments: ${label}`}
            disabled={disabled}
          >
            <span className={styles.truncate}>{label}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent surface="menu" align="start" className={styles.envMenu}>
          <Command>
            <CommandInput
              aria-label="Filter environments"
              placeholder="Filter environments"
              value={query}
              onValueChange={setQuery}
            />
            <CommandList
              style={{
                maxHeight: query
                  ? "calc(8 * var(--v4-size-control-sm) + var(--v4-space-3))"
                  : "calc(8 * var(--v4-size-control-sm) + 3 * var(--v4-space-3) + var(--v4-size-control-border))"
              }}
            >
              <CommandEmpty>No environment found</CommandEmpty>
              {environments.length > 0 && !query && (
                <>
                  <CommandGroup>
                    <CommandItem
                      value="__all__"
                      keywords={[]}
                      data-checked={!selected.length}
                      onSelect={() => {
                        onChange([]);
                        changeOpen(false);
                      }}
                    >
                      All environments
                    </CommandItem>
                  </CommandGroup>
                  <CommandSeparator />
                </>
              )}
              <CommandGroup>
                {environments.map((environment) => (
                  <CommandItem
                    key={environment.value}
                    value={environment.value}
                    keywords={[environment.label, environment.value]}
                    onSelect={switchTo}
                  >
                    <span className={styles.truncate}>{environment.label}</span>
                    <Tooltip content="Add or remove from view">
                      <span className={styles.envCheck}>
                        <Checkbox
                          aria-label={`Show ${environment.label} alongside others`}
                          checked={selected.includes(environment.value)}
                          onClick={(event) => event.stopPropagation()}
                          onCheckedChange={() => toggle(environment.value)}
                        />
                      </span>
                    </Tooltip>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
            <CommandSeparator alwaysRender />
            <CommandGroup forceMount>
              <CommandItem
                forceMount
                value="__add__"
                keywords={[]}
                disabled={!canCreate}
                onSelect={() => {
                  changeOpen(false);
                  setAdding(true);
                }}
              >
                <Icon name="plus" />
                Add environment
              </CommandItem>
            </CommandGroup>
            <p className={styles.envHint}>
              {canCreate
                ? "Use the checkboxes to select multiple environments."
                : "Use the checkboxes to select multiple environments. You don't have permission to add environments."}
            </p>
          </Command>
        </PopoverContent>
      </Popover>
      <AddEnvironmentDialog
        projectId={projectId}
        open={adding}
        onOpenChange={setAdding}
        report={report}
        onCreated={(slug) => {
          onCreated();
          onChange([slug]);
        }}
      />
    </>
  );
}
