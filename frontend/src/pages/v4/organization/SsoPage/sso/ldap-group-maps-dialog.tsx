import { useEffect, useId, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@app/components/v4/ui/alert-dialog";
import { Button } from "@app/components/v4/ui/button";
import { DataTable, type DataTableColumn } from "@app/components/v4/ui/data-table";
import { DropdownMenuItem } from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Field } from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Grid, Inline, Stack } from "@app/components/v4/ui/layout";
import { Select } from "@app/components/v4/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle
} from "@app/components/v4/ui/sheet";
import { Skeleton } from "@app/components/v4/ui/skeleton";
import type { LDAPGroupMap } from "@app/hooks/api/ldapConfig/types";

import { useOrgId } from "../../../access/permissions";
import { failed, saved } from "../../../access/toast";
import { useV4Adapter } from "../../../data/adapters";
import { orgHref, useGo } from "../../../links";

const schema = z.object({
  ldapGroupCN: z.string().min(1, "LDAP group CN is required"),
  groupSlug: z.string().min(1, "Infisical group is required")
});

type TFormData = z.infer<typeof schema>;

const columns: DataTableColumn<LDAPGroupMap>[] = [
  {
    id: "ldapGroupCN",
    header: "LDAP group CN",
    primary: true,
    grow: true,
    text: (row) => row.ldapGroupCN,
    render: (row) => row.ldapGroupCN
  },
  {
    id: "group",
    header: "Infisical group",
    grow: true,
    text: (row) => row.group.name,
    render: (row) => row.group.name
  }
];

export const LdapGroupMapsDialog = ({
  open,
  onOpenChange
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const orgId = useOrgId();
  const go = useGo();
  const sso = useV4Adapter("sso");
  const { data: ldapConfig } = sso.useLdapConfig(orgId);
  const { data: groups } = sso.useOrgGroups(orgId);
  const { data: groupMaps, isPending } = sso.useLdapGroupMaps(ldapConfig?.id ?? "");
  const createMapping = sso.useCreateLdapGroupMap();
  const deleteMapping = sso.useDeleteLdapGroupMap();
  const formId = useId();
  const [removing, setRemoving] = useState<LDAPGroupMap | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { control, handleSubmit, reset, setValue } = useForm<TFormData>({
    resolver: zodResolver(schema),
    defaultValues: { ldapGroupCN: "", groupSlug: "" }
  });

  useEffect(() => {
    if (groups && groups.length > 0) setValue("groupSlug", groups[0].slug);
  }, [groups, open]);

  const onFormSubmit = async ({ groupSlug, ldapGroupCN }: TFormData) => {
    if (!ldapConfig) return;
    try {
      await createMapping.mutateAsync({ ldapConfigId: ldapConfig.id, groupSlug, ldapGroupCN });
      reset();
      if (groups && groups.length > 0) setValue("groupSlug", groups[0].slug);
      saved(`Successfully added LDAP group mapping for ${ldapGroupCN}`);
    } catch (error) {
      failed(`Failed to add LDAP group mapping for ${ldapGroupCN}`, error);
    }
  };

  const onDeleteGroupMap = async (groupMap: LDAPGroupMap) => {
    setDeleting(true);
    try {
      await deleteMapping.mutateAsync({
        ldapConfigId: ldapConfig?.id ?? "",
        ldapGroupMapId: groupMap.id
      });
      saved(`Successfully deleted LDAP group mapping ${groupMap.ldapGroupCN}`);
      setRemoving(null);
    } catch (error) {
      failed(`Failed to delete LDAP group mapping ${groupMap.ldapGroupCN}`, error);
    } finally {
      setDeleting(false);
    }
  };

  let body = (
    <Stack gap={8}>
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-8 w-full" />
    </Stack>
  );
  if (groups && groups.length === 0)
    body = (
      <EmptyState
        size="sm"
        icon="user"
        title="No Infisical groups"
        description="Create an Infisical group in your organization before mapping LDAP groups."
        actions={
          <Button
            onClick={() => {
              onOpenChange(false);
              go(orgHref(orgId, "/access-management"));
            }}
          >
            Create group
          </Button>
        }
      />
    );
  if (groups && groups.length > 0)
    body = (
      <Stack gap={24}>
        <form id={formId} noValidate onSubmit={handleSubmit(onFormSubmit)}>
          <Stack gap={16}>
            <Grid columns={2}>
              <Controller
                control={control}
                name="ldapGroupCN"
                render={({ field, fieldState: { error } }) => (
                  <Field wide label="LDAP group CN" error={error?.message}>
                    <Input
                      placeholder="Engineering"
                      autoComplete="off"
                      invalid={Boolean(error)}
                      {...field}
                    />
                  </Field>
                )}
              />
              <Controller
                control={control}
                name="groupSlug"
                render={({ field: { onChange, value }, fieldState: { error } }) => (
                  <Field wide label="Infisical group" error={error?.message}>
                    <Select
                      aria-label="Infisical group"
                      placeholder="Select group"
                      invalid={Boolean(error)}
                      options={groups.map(({ name, slug }) => ({ value: slug, label: name }))}
                      value={value}
                      onChange={onChange}
                    />
                  </Field>
                )}
              />
            </Grid>
            <Inline justify="end">
              <Button type="submit" form={formId} loading={createMapping.isPending}>
                Add mapping
              </Button>
            </Inline>
          </Stack>
        </form>
        {isPending || (groupMaps && groupMaps.length > 0) ? (
          <DataTable
            label="LDAP group mappings"
            rows={groupMaps ?? []}
            columns={columns}
            loading={isPending}
            getRowId={(row) => row.id}
            rowLabel={(row) => row.ldapGroupCN}
            rowActions={{
              renderMenu: (row) => (
                <DropdownMenuItem variant="destructive" onSelect={() => setRemoving(row)}>
                  <Icon name="trash" />
                  Delete mapping
                </DropdownMenuItem>
              )
            }}
          />
        ) : (
          <EmptyState
            size="sm"
            title="No LDAP group mappings"
            description="Add a mapping above to assign LDAP groups to Infisical groups."
          />
        )}
      </Stack>
    );

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          onOpenChange(next);
          reset();
        }}
      >
        <SheetContent size="lg">
          <SheetHeader>
            <SheetTitle>Manage LDAP group mappings</SheetTitle>
          </SheetHeader>
          <SheetBody>{body}</SheetBody>
        </SheetContent>
      </Sheet>

      <AlertDialog open={Boolean(removing)} onOpenChange={(next) => !next && setRemoving(null)}>
        <AlertDialogContent tone="danger" pending={deleting}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete group mapping for &quot;{removing?.ldapGroupCN ?? ""}&quot;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Members of this LDAP group will no longer be added to the mapped Infisical group.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              loading={deleting}
              onClick={() => {
                if (removing) onDeleteGroupMap(removing);
              }}
            >
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
