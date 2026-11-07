import { useState } from "react";

import { Alert } from "@app/components/v4/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@app/components/v4/ui/alert-dialog";
import { Button } from "@app/components/v4/ui/button";
import { Card } from "@app/components/v4/ui/card";
import {
  DataTable,
  type DataTableColumn,
  type DataTableRowActions
} from "@app/components/v4/ui/data-table";
import { DropdownMenuItem, DropdownMenuSeparator } from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Field } from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { DataList } from "@app/components/v4/ui/list";
import { Loader } from "@app/components/v4/ui/loader";
import { Select } from "@app/components/v4/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v4/ui/sheet";
import { Snippet } from "@app/components/v4/ui/snippet";
import { Switch } from "@app/components/v4/ui/switch";
import { ProjectPermissionIdentityActions } from "@app/context/ProjectPermissionContext/types";
import { UNIVERSAL_AUTH_DEFAULTS } from "@app/hooks/api/identities/constants";
import { IdentityAuthMethod } from "@app/hooks/api/identities/enums";
import type { IdentityTrustedIp, IdentityUniversalAuth } from "@app/hooks/api/identities/types";

import { useV4Adapter } from "../../data/adapters";
import { useProjectPermission } from "../permissions";
import { failed, saved } from "../toast";
import { Gate, Muted, RESTRICTED } from "../ui";
import { type AuthIdentity, authMethodName, identitySubject, LockedBadge } from "./identity-common";

const allMethods = Object.values(IdentityAuthMethod);
const ACTIVE_LOCKOUTS = "Auth method has active lockouts";
const UNSUPPORTED = "Only Universal Auth can be managed here";

const isUniversal = (method?: IdentityAuthMethod) => method === IdentityAuthMethod.UNIVERSAL_AUTH;

const methodNote = (identity: AuthIdentity, method: IdentityAuthMethod) => {
  if (identity.authMethods.includes(method)) return "Configured";
  return isUniversal(method) ? undefined : UNSUPPORTED;
};

const ipList = (ips: readonly IdentityTrustedIp[]) =>
  ips
    .map((ip) => (ip.prefix === undefined ? ip.ipAddress : `${ip.ipAddress}/${ip.prefix}`))
    .join(", ");

const parseIps = (value: string) =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((ipAddress) => ({ ipAddress }));

const useAuthGates = (projectId: string, identityId?: string) => {
  const { permission } = useProjectPermission(projectId);
  const target = identitySubject(identityId ?? "");
  return {
    canEditAuth: permission.can(ProjectPermissionIdentityActions.EditAuth, target),
    canDelete: permission.can(ProjectPermissionIdentityActions.Delete, target)
  };
};

type UniversalAuthDraft = {
  accessTokenTTL: string;
  accessTokenMaxTTL: string;
  accessTokenNumUsesLimit: string;
  accessTokenTrustedIps: string;
  clientSecretTrustedIps: string;
  lockoutEnabled: boolean;
};

const draftOfConfig = (
  config: Pick<
    IdentityUniversalAuth,
    "accessTokenTTL" | "accessTokenMaxTTL" | "accessTokenNumUsesLimit" | "lockoutEnabled"
  > & {
    accessTokenTrustedIps: readonly { ipAddress: string; prefix?: number }[];
    clientSecretTrustedIps: readonly { ipAddress: string; prefix?: number }[];
  }
): UniversalAuthDraft => ({
  accessTokenTTL: String(config.accessTokenTTL),
  accessTokenMaxTTL: String(config.accessTokenMaxTTL),
  accessTokenNumUsesLimit: String(config.accessTokenNumUsesLimit),
  accessTokenTrustedIps: ipList(config.accessTokenTrustedIps as IdentityTrustedIp[]),
  clientSecretTrustedIps: ipList(config.clientSecretTrustedIps as IdentityTrustedIp[]),
  lockoutEnabled: config.lockoutEnabled
});

const NUMBER_FIELDS = [
  ["accessTokenTTL", "Access token TTL (seconds)"],
  ["accessTokenMaxTTL", "Access token max TTL (seconds)"],
  ["accessTokenNumUsesLimit", "Access token max number of uses"]
] as const;

const draftErrors = (draft: UniversalAuthDraft) =>
  Object.fromEntries(
    NUMBER_FIELDS.map(([key]) => [
      key,
      /^\d+$/.test(draft[key].trim()) ? undefined : "Enter a whole number of 0 or more"
    ])
  ) as Partial<Record<(typeof NUMBER_FIELDS)[number][0], string>>;

const UniversalAuthFields = ({
  draft,
  submitted,
  onChange
}: {
  draft: UniversalAuthDraft;
  submitted: boolean;
  onChange: (next: UniversalAuthDraft) => void;
}) => {
  const errors = submitted ? draftErrors(draft) : {};
  return (
    <Stack gap={16}>
      {NUMBER_FIELDS.map(([key, label]) => (
        <Field key={key} label={label} error={errors[key]}>
          <Input
            inputMode="numeric"
            value={draft[key]}
            invalid={Boolean(errors[key])}
            onChange={(event) => onChange({ ...draft, [key]: event.target.value })}
          />
        </Field>
      ))}
      <Field
        label="Access token trusted IPs"
        description="Comma-separated IP addresses or CIDR ranges."
      >
        <Input
          value={draft.accessTokenTrustedIps}
          onChange={(event) => onChange({ ...draft, accessTokenTrustedIps: event.target.value })}
        />
      </Field>
      <Field
        label="Client secret trusted IPs"
        description="Comma-separated IP addresses or CIDR ranges."
      >
        <Input
          value={draft.clientSecretTrustedIps}
          onChange={(event) => onChange({ ...draft, clientSecretTrustedIps: event.target.value })}
        />
      </Field>
      <Switch
        label="Lockout"
        description="Temporarily block a client after repeated failed sign-ins."
        checked={draft.lockoutEnabled}
        onChange={(lockoutEnabled) => onChange({ ...draft, lockoutEnabled })}
      />
    </Stack>
  );
};

const AuthMethodForm = ({
  identity,
  projectId,
  method,
  initial,
  pending,
  setPending,
  onClose
}: {
  identity: AuthIdentity;
  projectId: string;
  method?: IdentityAuthMethod;
  initial: UniversalAuthDraft;
  pending: boolean;
  setPending: (pending: boolean) => void;
  onClose: () => void;
}) => {
  const access = useV4Adapter("access");
  const addUniversalAuth = access.useAddIdentityUniversalAuth();
  const updateUniversalAuth = access.useUpdateIdentityUniversalAuth();
  const [selected, setSelected] = useState<string>(
    method ??
      (identity.authMethods.includes(IdentityAuthMethod.UNIVERSAL_AUTH)
        ? ""
        : IdentityAuthMethod.UNIVERSAL_AUTH)
  );
  const [draft, setDraft] = useState(initial);
  const [submitted, setSubmitted] = useState(false);
  const isUpdate = identity.authMethods.includes(selected as IdentityAuthMethod);
  const submit = async () => {
    setSubmitted(true);
    if (!isUniversal(selected as IdentityAuthMethod)) return;
    if (Object.values(draftErrors(draft)).some(Boolean)) return;
    const payload = {
      projectId,
      identityId: identity.id,
      accessTokenTTL: Number(draft.accessTokenTTL),
      accessTokenMaxTTL: Number(draft.accessTokenMaxTTL),
      accessTokenNumUsesLimit: Number(draft.accessTokenNumUsesLimit),
      accessTokenTrustedIps: parseIps(draft.accessTokenTrustedIps),
      clientSecretTrustedIps: parseIps(draft.clientSecretTrustedIps),
      lockoutEnabled: draft.lockoutEnabled
    };
    setPending(true);
    try {
      if (isUpdate) await updateUniversalAuth.mutateAsync(payload);
      else
        await addUniversalAuth.mutateAsync({
          ...UNIVERSAL_AUTH_DEFAULTS,
          ...payload
        });
      saved(`Successfully ${isUpdate ? "updated" : "added"} Universal Auth`);
      onClose();
    } catch (error) {
      failed(`Failed to ${isUpdate ? "update" : "add"} Universal Auth`, error);
    } finally {
      setPending(false);
    }
  };
  return (
    <>
      <SheetBody>
        <form
          id="project-identity-auth-method"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Stack gap={16}>
            <Field label="Auth method">
              <Select
                label="Auth method"
                placeholder="Select auth method..."
                value={selected}
                disabled={Boolean(method)}
                onChange={setSelected}
                options={allMethods.map((value) => ({
                  value,
                  label: authMethodName(value),
                  disabled:
                    !isUniversal(value) || (!method && identity.authMethods.includes(value)),
                  description: methodNote(identity, value)
                }))}
              />
            </Field>
            {isUniversal(selected as IdentityAuthMethod) && (
              <UniversalAuthFields draft={draft} submitted={submitted} onChange={setDraft} />
            )}
          </Stack>
        </form>
      </SheetBody>
      <SheetFooter>
        <Inline gap={8} justify="end">
          <Button variant="ghost" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="project-identity-auth-method"
            loading={pending}
            disabled={!isUniversal(selected as IdentityAuthMethod)}
          >
            {isUpdate ? "Update" : "Add"}
          </Button>
        </Inline>
      </SheetFooter>
    </>
  );
};

const EditUniversalAuthForm = (props: {
  identity: AuthIdentity;
  projectId: string;
  pending: boolean;
  setPending: (pending: boolean) => void;
  onClose: () => void;
}) => {
  const { data, isPending } = useV4Adapter("access").useIdentityUniversalAuth(props.identity.id);
  if (isPending)
    return (
      <SheetBody>
        <Loader label="Loading Universal Auth" />
      </SheetBody>
    );
  return (
    <AuthMethodForm
      {...props}
      method={IdentityAuthMethod.UNIVERSAL_AUTH}
      initial={draftOfConfig(data ?? { ...UNIVERSAL_AUTH_DEFAULTS })}
    />
  );
};

export const AuthMethodFormSheet = ({
  identity,
  projectId,
  method,
  open,
  onOpenChange
}: {
  identity?: AuthIdentity;
  projectId: string;
  method?: IdentityAuthMethod;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const [pending, setPending] = useState(false);
  const editing = Boolean(method && identity?.authMethods.includes(method));
  const formProps = identity && {
    identity,
    projectId,
    pending,
    setPending,
    onClose: () => onOpenChange(false)
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent pending={pending}>
        <SheetHeader>
          <SheetTitle>{editing ? "Edit auth method" : "Add auth method"}</SheetTitle>
        </SheetHeader>
        {formProps &&
          (editing && isUniversal(method) ? (
            <EditUniversalAuthForm {...formProps} />
          ) : (
            <AuthMethodForm
              {...formProps}
              method={method}
              initial={draftOfConfig(UNIVERSAL_AUTH_DEFAULTS)}
            />
          ))}
      </SheetContent>
    </Sheet>
  );
};

export const RemoveAuthMethodDialog = ({
  identity,
  projectId,
  method,
  onOpenChange
}: {
  identity?: AuthIdentity;
  projectId: string;
  method?: IdentityAuthMethod;
  onOpenChange: (open: boolean) => void;
}) => {
  const removeUniversalAuth = useV4Adapter("access").useDeleteIdentityUniversalAuth();
  const [pending, setPending] = useState(false);
  const run = async () => {
    if (!identity || !isUniversal(method)) return;
    setPending(true);
    try {
      await removeUniversalAuth.mutateAsync({ projectId, identityId: identity.id });
      saved("Successfully removed auth method");
      onOpenChange(false);
    } catch (error) {
      failed("Failed to remove auth method", error);
    } finally {
      setPending(false);
    }
  };
  return (
    <AlertDialog open={Boolean(identity && method)} onOpenChange={onOpenChange}>
      <AlertDialogContent tone="danger" confirmText="confirm" pending={pending}>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove auth method</AlertDialogTitle>
          <AlertDialogDescription>
            {`Remove ${method ? authMethodName(method) : ""} from ${identity?.name ?? "this identity"}. Clients using this method can no longer authenticate as this identity, and its configuration and issued credentials are deleted. The method can be configured again later.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={(event) => {
              event.preventDefault();
              run();
            }}
          >
            Remove auth method
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

const UniversalAuthDetails = ({ identityId }: { identityId: string }) => {
  const { data, isPending } = useV4Adapter("access").useIdentityUniversalAuth(identityId);
  if (isPending) return <Loader label="Loading Universal Auth" />;
  if (!data) return <Muted>Universal Auth configuration is unavailable.</Muted>;
  return (
    <Stack gap={24}>
      <DataList
        variant="props"
        items={[
          ["Client secret trusted IPs", ipList(data.clientSecretTrustedIps)],
          ["Lockout", data.lockoutEnabled ? "Enabled" : "Disabled"],
          ["Access token TTL (seconds)", String(data.accessTokenTTL)],
          ["Access token max TTL (seconds)", String(data.accessTokenMaxTTL)],
          ["Access token max number of uses", String(data.accessTokenNumUsesLimit)],
          ["Access token trusted IPs", ipList(data.accessTokenTrustedIps)]
        ]}
      />
      <Field label="Client ID">
        <Snippet label="Client ID" copyLabel="Copy client ID" value={data.clientId} />
      </Field>
    </Stack>
  );
};

export const AuthMethodSheet = ({
  identity,
  projectId,
  method,
  onOpenChange,
  onEdit,
  onRemove
}: {
  identity?: AuthIdentity;
  projectId: string;
  method?: IdentityAuthMethod;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
  onRemove: () => void;
}) => {
  const { canEditAuth, canDelete } = useAuthGates(projectId, identity?.id);
  const clearLockouts = useV4Adapter("access").useClearIdentityUniversalAuthLockouts();
  const locked = Boolean(method && identity?.activeLockoutAuthMethods.includes(method));
  const supported = isUniversal(method);
  return (
    <Sheet open={Boolean(identity && method)} onOpenChange={onOpenChange}>
      <SheetContent>
        {identity && method && (
          <>
            <SheetHeader>
              <SheetTitle>
                <Inline gap={8}>
                  {authMethodName(method)}
                  {locked && <LockedBadge label={ACTIVE_LOCKOUTS} />}
                </Inline>
              </SheetTitle>
            </SheetHeader>
            <SheetBody>
              <Stack gap={24}>
                {locked && (
                  <Alert
                    tone="bad"
                    title={ACTIVE_LOCKOUTS}
                    actions={
                      <Gate allowed={canEditAuth && supported}>
                        <Button
                          variant="outline"
                          size="xs"
                          disabled={!canEditAuth || !supported}
                          onClick={async () => {
                            try {
                              const cleared = await clearLockouts.mutateAsync({
                                identityId: identity.id
                              });
                              saved(
                                `Successfully cleared ${cleared} lockout${cleared === 1 ? "" : "s"}`
                              );
                            } catch (error) {
                              failed("Failed to clear lockouts", error);
                            }
                          }}
                        >
                          Reset all lockouts
                        </Button>
                      </Gate>
                    }
                  >
                    Clients are blocked from signing in with this method until the lockout ends or
                    is reset.
                  </Alert>
                )}
                {supported ? (
                  <UniversalAuthDetails identityId={identity.id} />
                ) : (
                  <Alert tone="info" title={UNSUPPORTED}>
                    {`The ${authMethodName(method)} configuration for this machine identity is not shown here.`}
                  </Alert>
                )}
              </Stack>
            </SheetBody>
            <SheetFooter>
              <Inline gap={8} justify="between">
                <Gate
                  allowed={canEditAuth && supported}
                  reason={supported ? RESTRICTED : UNSUPPORTED}
                >
                  <Button variant="primary" disabled={!canEditAuth || !supported} onClick={onEdit}>
                    Edit
                  </Button>
                </Gate>
                <Gate
                  allowed={canDelete && supported}
                  reason={supported ? RESTRICTED : UNSUPPORTED}
                >
                  <Button
                    variant="destructive"
                    disabled={!canDelete || !supported}
                    onClick={onRemove}
                  >
                    Remove
                  </Button>
                </Gate>
              </Inline>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};

export const useAuthMethodFlows = (projectId: string, identity?: AuthIdentity) => {
  const [viewing, setViewing] = useState<IdentityAuthMethod>();
  const [form, setForm] = useState<{ method?: IdentityAuthMethod; key: number }>();
  const [removing, setRemoving] = useState<IdentityAuthMethod>();
  return {
    view: setViewing,
    add: () => setForm({ key: Date.now() }),
    edit: (method: IdentityAuthMethod) => setForm({ method, key: Date.now() }),
    remove: setRemoving,
    overlays: (
      <>
        <AuthMethodSheet
          identity={identity}
          projectId={projectId}
          method={viewing}
          onOpenChange={(open) => !open && setViewing(undefined)}
          onEdit={() => {
            setForm({ method: viewing, key: Date.now() });
            setViewing(undefined);
          }}
          onRemove={() => {
            setRemoving(viewing);
            setViewing(undefined);
          }}
        />
        <AuthMethodFormSheet
          key={form?.key}
          identity={identity}
          projectId={projectId}
          method={form?.method}
          open={Boolean(form)}
          onOpenChange={(open) => !open && setForm(undefined)}
        />
        <RemoveAuthMethodDialog
          identity={identity}
          projectId={projectId}
          method={removing}
          onOpenChange={(open) => !open && setRemoving(undefined)}
        />
      </>
    )
  };
};

export const ProjectIdentityAuthSection = ({
  identity,
  projectId
}: {
  identity: AuthIdentity;
  projectId: string;
}) => {
  const { canEditAuth, canDelete } = useAuthGates(projectId, identity.id);
  const flows = useAuthMethodFlows(projectId, identity);
  const methods = identity.authMethods;
  const addButton = (variant: "outline" | "primary") => (
    <Gate allowed={canEditAuth}>
      <Button variant={variant} size="xs" icon="plus" disabled={!canEditAuth} onClick={flows.add}>
        Add auth method
      </Button>
    </Gate>
  );
  const columns: DataTableColumn<IdentityAuthMethod>[] = [
    {
      id: "method",
      header: "Auth method",
      render: (method) => (
        <Inline gap={8} wrap={false}>
          <span>{authMethodName(method)}</span>
          {identity.activeLockoutAuthMethods.includes(method) && (
            <LockedBadge label={ACTIVE_LOCKOUTS} />
          )}
        </Inline>
      )
    }
  ];

  const rowActions: DataTableRowActions<IdentityAuthMethod> = {
    inline: [
      {
        label: "Edit auth method",
        icon: "settings",
        disabledReason: (method) => {
          if (!canEditAuth) return RESTRICTED;
          return isUniversal(method) ? undefined : UNSUPPORTED;
        },
        onSelect: flows.edit
      }
    ],
    renderMenu: (method) => (
      <>
        <DropdownMenuItem onSelect={() => flows.view(method)}>
          <Icon name="eye" />
          View auth method
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={!canDelete || !isUniversal(method)}
          description={
            (!canDelete && RESTRICTED) || (isUniversal(method) ? undefined : UNSUPPORTED)
          }
          onSelect={() => flows.remove(method)}
        >
          <Icon name="trash" />
          Remove auth method
        </DropdownMenuItem>
      </>
    )
  };

  return (
    <>
      <Card
        variant="framed"
        title="Authentication"
        description="Configure authentication methods"
        flush={methods.length > 0}
        action={
          methods.length > 0 && methods.length < allMethods.length
            ? addButton("outline")
            : undefined
        }
      >
        {methods.length > 0 ? (
          <DataTable
            label="Auth methods"
            rows={methods}
            columns={columns}
            rowActions={rowActions}
            getRowId={(method) => method}
            rowLabel={authMethodName}
            onRowActivate={flows.view}
          />
        ) : (
          <EmptyState
            size="sm"
            icon="key"
            title="This machine identity has no auth methods configured"
            description="Add an auth method to use this machine identity"
            actions={addButton("primary")}
          />
        )}
      </Card>
      {flows.overlays}
    </>
  );
};
