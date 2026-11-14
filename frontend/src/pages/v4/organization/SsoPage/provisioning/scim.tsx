import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, AlertDescription, AlertTitle } from "@infisical/cipher/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@infisical/cipher/ui/alert-dialog";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import { DocumentationLink } from "@infisical/cipher/ui/documentation-link";
import { DropdownMenuItem } from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Field } from "@infisical/cipher/ui/field";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { Switch } from "@infisical/cipher/ui/switch";
import { Heading } from "@infisical/cipher/ui/text";
import { Tooltip } from "@infisical/cipher/ui/tooltip";
import { z } from "zod";

import { ScimUpgradeIntent } from "@app/components/license/UpgradeGate/capability-upgrade-intents";
import {
  OrgPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { formatDateTime } from "@app/helpers/datetime";
import type { ScimTokenData } from "@app/hooks/api/scim/types";

import { useOrgId, useOrgPermission } from "../../../access/permissions";
import { failed, saved, toast } from "../../../access/toast";
import { Gate } from "../../../access/ui";
import { useV4Adapter } from "../../../data/adapters";
import { useUpgradeGate } from "../../../license";

const schema = z.object({
  description: z.string().optional(),
  ttlDays: z.string()
});

type FormData = z.infer<typeof schema>;

const CopyField = ({
  label,
  copyLabel,
  value
}: {
  label: string;
  copyLabel: string;
  value: string;
}) => (
  <Field label={label} wide>
    <Input
      mono
      readOnly
      value={value}
      trailing={
        <Tooltip content={copyLabel} side="top">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            icon="copy"
            iconOnly
            onClick={() => {
              navigator.clipboard?.writeText(value).catch(() => undefined);
              toast({ tone: "neutral", title: `${label} copied to clipboard` });
            }}
          >
            {copyLabel}
          </Button>
        </Tooltip>
      }
    />
  </Field>
);

const tokenExpiry = ({ ttlDays, createdAt }: ScimTokenData) => {
  // ttlDays above 9999 predates validation; those tokens show no expiry
  if (ttlDays <= 0 || ttlDays > 9999) return undefined;
  return new Date(new Date(createdAt).getTime() + ttlDays * 86400 * 1000);
};

const ScimTokenDialog = ({
  open,
  onOpenChange
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const orgId = useOrgId();
  const sso = useV4Adapter("sso");
  const { data: tokens = [], isPending } = sso.useScimTokens(orgId);
  const createToken = sso.useCreateScimToken();
  const deleteToken = sso.useDeleteScimToken();
  const [token, setToken] = useState("");
  const [deleting, setDeleting] = useState<ScimTokenData | null>(null);
  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { description: "", ttlDays: "365" }
  });
  const scimUrl = `${window.origin}/api/v1/scim`;

  const onSubmit = async ({ description, ttlDays }: FormData) => {
    try {
      const { scimToken } = await createToken.mutateAsync({
        organizationId: orgId,
        description,
        ttlDays: Number(ttlDays)
      });
      setToken(scimToken);
      saved("SCIM token created");
    } catch (error) {
      failed("Failed to create SCIM token", error);
    }
  };

  const columns: DataTableColumn<ScimTokenData>[] = [
    {
      id: "description",
      header: "Description",
      primary: true,
      grow: true,
      text: (row) => row.description,
      render: (row) => row.description || <span className="text-muted-foreground">None</span>
    },
    {
      id: "expiresAt",
      header: "Expires at",
      width: 190,
      render: (row) => {
        const expiresAt = tokenExpiry(row);
        return expiresAt ? (
          formatDateTime({ timestamp: expiresAt })
        ) : (
          <span className="text-muted-foreground">Never</span>
        );
      }
    },
    {
      id: "createdAt",
      header: "Created at",
      width: 190,
      render: (row) => formatDateTime({ timestamp: row.createdAt })
    }
  ];

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          onOpenChange(next);
          reset();
          setToken("");
        }}
      >
        <DialogContent pending={isSubmitting} className="sm:max-w-3xl">
          <form onSubmit={handleSubmit(onSubmit)}>
            <DialogHeader>
              <DialogTitle>
                <Inline gap={8} align="center">
                  Manage SCIM credentials
                  <DocumentationLink
                    href="https://infisical.com/docs/documentation/platform/scim/overview"
                    subject="SCIM"
                  />
                </Inline>
              </DialogTitle>
              <DialogDescription>
                Generate and manage the tokens your SCIM provider uses to authenticate.
              </DialogDescription>
            </DialogHeader>
            <Stack gap={16}>
              <CopyField label="SCIM URL" copyLabel="Copy SCIM URL" value={scimUrl} />
              {token ? (
                <>
                  <CopyField label="New SCIM token" copyLabel="Copy SCIM token" value={token} />
                  <Alert tone="info">
                    <AlertTitle>Copy this token now</AlertTitle>
                    <AlertDescription>You won&apos;t be able to see it again.</AlertDescription>
                  </Alert>
                </>
              ) : (
                <>
                  <Controller
                    control={control}
                    name="description"
                    render={({ field, fieldState: { error } }) => (
                      <Field label="Description" optional wide error={error?.message}>
                        <Input
                          placeholder="Description"
                          autoComplete="off"
                          invalid={Boolean(error)}
                          {...field}
                        />
                      </Field>
                    )}
                  />
                  <Controller
                    control={control}
                    name="ttlDays"
                    render={({ field, fieldState: { error } }) => (
                      <Field
                        label="TTL (days)"
                        wide
                        description="Use 0 for a token that never expires."
                        error={error?.message}
                      >
                        <Input
                          type="number"
                          min="0"
                          step="1"
                          placeholder="0"
                          invalid={Boolean(error)}
                          {...field}
                        />
                      </Field>
                    )}
                  />
                  <Stack gap={8}>
                    <Heading level={3} size="subsection">
                      SCIM tokens
                    </Heading>
                    <DataTable
                      label="SCIM tokens"
                      rows={tokens}
                      columns={columns}
                      loading={isPending}
                      loadingRows={3}
                      height={tokens.length > 6 ? 320 : undefined}
                      getRowId={(row) => row.id}
                      rowLabel={(row) => row.description || row.id}
                      empty={
                        <EmptyState
                          size="sm"
                          media="bare"
                          icon="key"
                          title="No SCIM tokens"
                          description="Create a token above to authenticate your SCIM provider."
                        />
                      }
                      rowActions={{
                        renderMenu: (row) => (
                          <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(row)}>
                            <Icon name="trash" />
                            Delete token
                          </DropdownMenuItem>
                        )
                      }}
                    />
                  </Stack>
                </>
              )}
            </Stack>
            <DialogFooter>
              {token ? (
                <DialogClose asChild>
                  <Button type="button">Got it</Button>
                </DialogClose>
              ) : (
                <>
                  <DialogClose asChild>
                    <Button type="button" variant="outline">
                      Close
                    </Button>
                  </DialogClose>
                  <Button type="submit" loading={isSubmitting}>
                    Create token
                  </Button>
                </>
              )}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={Boolean(deleting)} onOpenChange={(next) => !next && setDeleting(null)}>
        <AlertDialogContent tone="danger" pending={deleteToken.isPending}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete SCIM token?</AlertDialogTitle>
            <AlertDialogDescription>
              Any SCIM provider using this token will no longer be able to authenticate. This cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                variant="destructive"
                loading={deleteToken.isPending}
                onClick={async (event) => {
                  event.preventDefault();
                  if (!deleting) return;
                  try {
                    await deleteToken.mutateAsync({
                      organizationId: orgId,
                      scimTokenId: deleting.id
                    });
                    setDeleting(null);
                    saved("SCIM token deleted");
                  } catch (error) {
                    failed("Failed to delete SCIM token", error);
                  }
                }}
              >
                Delete
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export const ScimProvisioning = () => {
  const orgId = useOrgId();
  const sso = useV4Adapter("sso");
  const org = useV4Adapter("org");
  const { permission } = useOrgPermission();
  const { data: organization } = org.useOrganization(orgId);
  const updateOrganization = org.useUpdateOrganization();
  const { data: entitlements, isPending: isSubscriptionPending } = sso.useSubscription(orgId);
  const { openUpgradeGate, upgradeGate } = useUpgradeGate();
  const [configuring, setConfiguring] = useState(false);
  const canRead = permission.can(OrgPermissionActions.Read, OrgPermissionSubjects.Scim);
  const canEdit = permission.can(OrgPermissionActions.Edit, OrgPermissionSubjects.Scim);

  const openScimUpgrade = () =>
    openUpgradeGate({
      intent: { ...ScimUpgradeIntent, isEnterpriseFeature: true },
      paywallKey: "organization.org-scim"
    });

  return (
    <>
      <Card
        variant="framed"
        title="SCIM provisioning"
        action={
          <Button
            variant="outline"
            size="xs"
            loading={isSubscriptionPending}
            disabledReason={canRead ? undefined : "You need permission to read SCIM."}
            onClick={() => (entitlements?.scim ? setConfiguring(true) : openScimUpgrade())}
          >
            Configure
          </Button>
        }
      >
        <Gate allowed={canEdit} reason="You need permission to edit SCIM.">
          <Switch
            layout="row"
            label="Enable SCIM"
            description="Allow member provisioning and deprovisioning with SCIM."
            checked={organization?.scimEnabled ?? false}
            disabled={!canEdit || !organization || updateOrganization.isPending}
            onChange={async (scimEnabled) => {
              if (!entitlements?.scim) {
                openScimUpgrade();
                return;
              }
              try {
                await updateOrganization.mutateAsync({ orgId, scimEnabled });
                saved(`SCIM provisioning ${scimEnabled ? "enabled" : "disabled"}`);
              } catch (error) {
                failed(`Failed to ${scimEnabled ? "enable" : "disable"} SCIM provisioning`, error);
              }
            }}
          />
        </Gate>
      </Card>
      <ScimTokenDialog open={configuring} onOpenChange={setConfiguring} />
      {upgradeGate}
    </>
  );
};
