import { useState } from "react";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import type { FilterBarFilter } from "@infisical/cipher/patterns/filter-bar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  DiscardChangesAlertDialog
} from "@infisical/cipher/ui/alert-dialog";
import { Button } from "@infisical/cipher/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@infisical/cipher/ui/dropdown-menu";
import { Field } from "@infisical/cipher/ui/field";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import { MultiStep } from "@infisical/cipher/ui/multi-step";
import { Switch } from "@infisical/cipher/ui/switch";

import {
  ProjectPermissionActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import type {
  TCertificateInventoryView,
  TInventoryViewFilters,
  TListInventoryViewsResponse,
  TSystemView,
  TSystemViewFilters
} from "@app/hooks/api/certificateInventoryViews/types";

import { useProjectPermission } from "../../access/permissions";
import { failed, readableFailure, saved } from "../../access/toast";
import { RESTRICTED } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";
import { useV4Session } from "../../data/session/contract";
import { VIEW_KEY_ALGORITHMS } from "./view-key-algorithms";

export type InventoryViewScope = Pick<TInventoryViewFilters, "applicationIds" | "metadata">;

export type InventoryView = {
  filters: FilterBarFilter[];
  includeDeleted: boolean;
  scope?: InventoryViewScope;
};

type ViewFilters = TInventoryViewFilters & Omit<TSystemViewFilters, "status">;

const listOf = (value?: string | string[]) => {
  if (!value) return [];
  return Array.isArray(value) ? value : value.split(",");
};

const dateValue = (value: string | Date) => {
  if (value instanceof Date) return value.toISOString().split("T")[0];
  const relative = value.match(/^\+(\d+)d$/);
  if (!relative) return value.split("T")[0];
  const date = new Date();
  date.setDate(date.getDate() + Number(relative[1]));
  return date.toISOString().split("T")[0];
};

const viewToFilters = (viewId: string, view: ViewFilters): InventoryView => {
  const filters: FilterBarFilter[] = [];
  const add = (field: string, values: string[]) => {
    if (values.length) filters.push({ field, values });
  };
  const addDate = (field: string, operator: "before" | "after", value?: string | Date) => {
    if (value) filters.push({ field, operator, values: [dateValue(value)] });
  };
  add("status", listOf(view.status));
  addDate("notAfter", "before", view.notAfterTo);
  addDate("notAfter", "after", view.notAfterFrom);
  addDate("notBefore", "before", view.notBeforeTo);
  addDate("notBefore", "after", view.notBeforeFrom);
  add("enrollmentType", view.enrollmentTypes ?? []);
  add("keyAlgorithm", [...(VIEW_KEY_ALGORITHMS[viewId] ?? listOf(view.keyAlgorithm))]);
  add("keySize", (view.keySizes ?? []).map(String));
  add("caId", view.caIds ?? []);
  add("profileId", view.profileIds ?? []);
  add("source", listOf(view.source));
  const scope: InventoryViewScope = {};
  if (view.applicationIds?.length) scope.applicationIds = view.applicationIds;
  if (view.metadata?.length) scope.metadata = view.metadata;
  return {
    filters,
    includeDeleted: Boolean(view.includeDeleted),
    scope: Object.keys(scope).length ? scope : undefined
  };
};

const filtersToView = ({
  filters,
  includeDeleted,
  scope
}: InventoryView): TInventoryViewFilters => {
  const view: TInventoryViewFilters = { ...scope, ...(includeDeleted ? { includeDeleted } : {}) };
  filters.forEach(({ field, operator, values }) => {
    if (!values.length) return;
    if (field === "notAfter" || field === "notBefore") {
      const [date] = values;
      view[`${field}${operator === "after" ? "From" : "To"}`] = date;
      return;
    }
    if (field === "status") view.status = values.join(",");
    if (field === "enrollmentType") view.enrollmentTypes = values;
    if (field === "keyAlgorithm") view.keyAlgorithm = values;
    if (field === "keySize") view.keySizes = values.map(Number);
    if (field === "source") view.source = values;
    if (field === "caId") view.caIds = values;
    if (field === "profileId") view.profileIds = values;
  });
  return view;
};

const SaveViewDialog = ({
  current,
  onClose,
  onSaved
}: {
  current: InventoryView;
  onClose: () => void;
  onSaved: (viewId: string) => void;
}) => {
  const create = useV4Adapter("certificates").useCreateInventoryView();
  const [name, setName] = useState("");
  const [isShared, setIsShared] = useState(false);
  const { requestDiscard, discardDialogProps } = useDiscardChangesGuard({
    isDirty: name.trim() !== "" || isShared,
    onDiscard: onClose
  });

  const submit = async () => {
    const trimmed = name.trim();
    const view = await create
      .mutateAsync({ name: trimmed, filters: filtersToView(current), isShared })
      .catch(readableFailure("Couldn't save the view"));
    saved(`View ${trimmed} saved`);
    onSaved(view.id);
    onClose();
  };

  return (
    <>
      <MultiStep
        variant="dialog"
        title="Save as view"
        open
        onOpenChange={(next) => {
          if (next || create.isPending) return;
          requestDiscard();
        }}
        completeLabel="Save view"
        onComplete={submit}
        steps={[
          {
            title: "View",
            disabledReason: name.trim() ? undefined : "Enter a name",
            content: (
              <Stack gap={16}>
                <Field label="Name">
                  <Input
                    value={name}
                    maxLength={255}
                    onChange={(event) => setName(event.target.value)}
                  />
                </Field>
                <Switch
                  layout="row"
                  label="Share with team"
                  checked={isShared}
                  onCheckedChange={setIsShared}
                />
              </Stack>
            )
          }
        ]}
      />
      <DiscardChangesAlertDialog
        {...discardDialogProps}
        description="The view name will be lost."
      />
    </>
  );
};

const DeleteViewDialog = ({
  view,
  onClose,
  onDeleted
}: {
  view?: TCertificateInventoryView;
  onClose: () => void;
  onDeleted: () => void;
}) => {
  const remove = useV4Adapter("certificates").useDeleteInventoryView();
  return (
    <AlertDialog open={Boolean(view)} onOpenChange={(next) => !next && onClose()}>
      <AlertDialogContent tone="danger" pending={remove.isPending}>
        <AlertDialogHeader>
          <AlertDialogTitle>{`Delete ${view?.name ?? "view"}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            {view?.isShared
              ? "It is removed for everyone on the team. You can't undo this."
              : "You can't undo this."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={async (event) => {
              event.preventDefault();
              if (!view) return;
              try {
                await remove.mutateAsync({ viewId: view.id });
              } catch (failure) {
                failed(`Couldn't delete ${view.name}`, failure);
                return;
              }
              saved(`View ${view.name} deleted`);
              onDeleted();
              onClose();
            }}
          >
            Delete view
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

const groupViews = (data?: TListInventoryViewsResponse) => {
  const systemViews = data?.systemViews ?? [];
  const sharedViews = data?.sharedViews ?? [];
  const customViews = data?.customViews ?? [];
  return {
    systemViews,
    sharedViews,
    customViews,
    all: [...systemViews, ...sharedViews, ...customViews] as (
      | TSystemView
      | TCertificateInventoryView
    )[]
  };
};

const savedOwned = (
  views: (TSystemView | TCertificateInventoryView)[],
  activeViewId: string | null,
  userId: string
) =>
  views.find(
    (view): view is TCertificateInventoryView =>
      view.id === activeViewId &&
      !("isSystem" in view && view.isSystem) &&
      view.createdByUserId === userId
  );

const saveBlock = (canCreate: boolean, current: InventoryView) => {
  if (!canCreate) return RESTRICTED;
  if (!current.filters.length && !current.includeDeleted) return "Apply a filter first";
  return undefined;
};

export const InventoryViewsMenu = ({
  projectId,
  activeViewId,
  current,
  onSelect
}: {
  projectId: string;
  activeViewId: string | null;
  current: InventoryView;
  onSelect: (viewId: string | null, view: InventoryView) => void;
}) => {
  const certificates = useV4Adapter("certificates");
  const { data } = certificates.useInventoryViews();
  const update = certificates.useUpdateInventoryView();
  const { user } = useV4Session();
  const { permission } = useProjectPermission(projectId);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<TCertificateInventoryView>();
  const can = (action: ProjectPermissionActions) =>
    permission.can(action, ProjectPermissionSub.CertificateInventoryViews);

  if (!can(ProjectPermissionActions.Read)) return null;

  const { systemViews, sharedViews, customViews, all } = groupViews(data);
  const active = all.find((view) => view.id === activeViewId);
  const owned = savedOwned(all, activeViewId, user.id);
  const saveReason = saveBlock(can(ProjectPermissionActions.Create), current);

  const select = (viewId: string) => {
    const view = all.find((entry) => entry.id === viewId);
    if (view) onSelect(view.id, viewToFilters(view.id, view.filters as ViewFilters));
  };

  const toggleShare = async (view: TCertificateInventoryView) => {
    try {
      await update.mutateAsync({ viewId: view.id, isShared: !view.isShared });
      saved(
        view.isShared ? `${view.name} is now personal` : `${view.name} is shared with the team`
      );
    } catch (failure) {
      failed("Couldn't change who can see the view", failure);
    }
  };

  const group = (label: string, views: { id: string; name: string }[]) =>
    views.length ? (
      <>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        {views.map((view) => (
          <DropdownMenuRadioItem key={view.id} value={view.id} closeOnSelect>
            {view.name}
          </DropdownMenuRadioItem>
        ))}
      </>
    ) : null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" layout="trigger" icon="layout-grid" style={{ maxWidth: 280 }}>
            {active?.name ?? "Views"}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" style={{ maxWidth: 360 }}>
          <DropdownMenuRadioGroup value={activeViewId ?? ""} onValueChange={select}>
            <DropdownMenuLabel>System views</DropdownMenuLabel>
            {systemViews.map((view) => (
              <DropdownMenuRadioItem key={view.id} value={view.id} closeOnSelect>
                {view.name}
              </DropdownMenuRadioItem>
            ))}
            {group("Shared views", sharedViews)}
            {group("My views", customViews)}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabledReason={saveReason} onSelect={() => setSaving(true)}>
            <Icon name="plus" />
            Save as view
          </DropdownMenuItem>
          {owned && (
            <>
              <DropdownMenuItem
                disabledReason={can(ProjectPermissionActions.Edit) ? undefined : RESTRICTED}
                onSelect={() => toggleShare(owned)}
              >
                <Icon name="globe" />
                {owned.isShared ? "Make personal" : "Share with team"}
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                disabledReason={can(ProjectPermissionActions.Delete) ? undefined : RESTRICTED}
                onSelect={() => setDeleting(owned)}
              >
                <Icon name="trash" />
                Delete view
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {saving && (
        <SaveViewDialog
          current={current}
          onClose={() => setSaving(false)}
          onSaved={(viewId) => onSelect(viewId, current)}
        />
      )}
      <DeleteViewDialog
        view={deleting}
        onClose={() => setDeleting(undefined)}
        onDeleted={() => onSelect("system-default", { filters: [], includeDeleted: false })}
      />
    </>
  );
};
