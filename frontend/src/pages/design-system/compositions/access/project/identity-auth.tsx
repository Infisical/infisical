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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Field } from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { DataList } from "@app/components/v4/ui/list";
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

import { useAccess } from "../context";
import { type AuthMethod, authMethodNames, type OrgIdentity } from "../model";
import { type AccessColumn, AccessTable } from "../table";
import { Gate, useCan } from "../ui";
import { LockedBadge, lockedMethods } from "./identity-common";

const allMethods = Object.keys(authMethodNames) as AuthMethod[];
const ACTIVE_LOCKOUTS = "Auth method has active lockouts";

const setIdentity = (
  update: ReturnType<typeof useAccess>["update"],
  id: string,
  patch: (identity: OrgIdentity) => Partial<OrgIdentity>
) =>
  update((current) => ({
    ...current,
    orgIdentities: current.orgIdentities.map((identity) =>
      identity.id === id ? { ...identity, ...patch(identity) } : identity
    )
  }));

export const AuthMethodFormSheet = ({
  identity,
  method,
  open,
  onOpenChange
}: {
  identity?: OrgIdentity;
  method?: AuthMethod;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { update, saved } = useAccess();
  const [selected, setSelected] = useState<string>(method ?? "");
  const [pending, setPending] = useState(false);
  const isUpdate = Boolean(identity?.authMethods.includes(selected as AuthMethod));
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{isUpdate ? "Edit auth method" : "Add auth method"}</SheetTitle>
        </SheetHeader>
        <SheetBody>
          <form
            id="project-identity-auth-method"
            onSubmit={(event) => {
              event.preventDefault();
              if (!identity || !selected) return;
              setPending(true);
              window.setTimeout(() => {
                setIdentity(update, identity.id, (current) => ({
                  authMethods: current.authMethods.includes(selected as AuthMethod)
                    ? current.authMethods
                    : [...current.authMethods, selected as AuthMethod]
                }));
                setPending(false);
                onOpenChange(false);
                saved(
                  `Successfully ${isUpdate ? "updated" : "added"} ${authMethodNames[selected as AuthMethod]}`
                );
              }, 500);
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
                    label: authMethodNames[value],
                    description: identity?.authMethods.includes(value) ? "Configured" : undefined
                  }))}
                />
              </Field>
              {selected && (
                <Alert tone="info" title="Default settings">
                  This preview applies the default access token settings for this method. The
                  method-specific configuration form is not part of this composition.
                </Alert>
              )}
            </Stack>
          </form>
        </SheetBody>
        <SheetFooter>
          <Button variant="ghost" disabled={pending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="project-identity-auth-method"
            loading={pending}
            disabled={!selected}
          >
            {isUpdate ? "Update" : "Add"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export const RemoveAuthMethodDialog = ({
  identity,
  method,
  onOpenChange
}: {
  identity?: OrgIdentity;
  method?: AuthMethod;
  onOpenChange: (open: boolean) => void;
}) => {
  const { update, saved } = useAccess();
  return (
    <AlertDialog open={Boolean(identity && method)} onOpenChange={onOpenChange}>
      <AlertDialogContent tone="danger" confirmText="confirm">
        <AlertDialogHeader>
          <AlertDialogTitle>Remove auth method</AlertDialogTitle>
          <AlertDialogDescription>
            {`Remove ${method ? authMethodNames[method] : ""} from ${identity?.name ?? "this identity"}. Clients using this method can no longer authenticate as this identity, and its configuration and issued credentials are deleted. The method can be configured again later.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              if (!identity || !method) return;
              setIdentity(update, identity.id, (current) => ({
                authMethods: current.authMethods.filter((item) => item !== method)
              }));
              onOpenChange(false);
              saved("Successfully removed auth method");
            }}
          >
            Remove auth method
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

const tokenSettings = (method: AuthMethod): [string, string][] => [
  ...(method === "universal"
    ? ([
        ["Client secret trusted IPs", "0.0.0.0/0, ::/0"],
        ["Lockout", "Enabled"]
      ] as [string, string][])
    : []),
  ["Access token TTL (seconds)", "2592000"],
  ["Access token max TTL (seconds)", "2592000"],
  ["Access token max number of uses", "0"],
  ["Access token trusted IPs", "0.0.0.0/0, ::/0"]
];

export const AuthMethodSheet = ({
  identity,
  method,
  onOpenChange,
  onEdit,
  onRemove
}: {
  identity?: OrgIdentity;
  method?: AuthMethod;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
  onRemove: () => void;
}) => {
  const { update, saved } = useAccess();
  const can = useCan("project");
  const locked = Boolean(identity && method && lockedMethods(identity).includes(method));
  return (
    <Sheet open={Boolean(identity && method)} onOpenChange={onOpenChange}>
      <SheetContent>
        {identity && method && (
          <>
            <SheetHeader>
              <SheetTitle>
                <Inline gap={8}>
                  {authMethodNames[method]}
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
                      <Gate allowed={can("identity", "edit")}>
                        <Button
                          variant="outline"
                          size="xs"
                          disabled={!can("identity", "edit")}
                          onClick={() => {
                            setIdentity(update, identity.id, () => ({ lockedOut: false }));
                            saved("Successfully cleared 1 lockout");
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
                <DataList variant="props" items={tokenSettings(method)} />
                {method === "universal" && (
                  <Field label="Client ID">
                    <Snippet
                      label="Client ID"
                      copyLabel="Copy client ID"
                      value="demo-client-id-0000-not-a-real-id"
                    />
                  </Field>
                )}
              </Stack>
            </SheetBody>
            <SheetFooter>
              <Inline gap={8} justify="between">
                <Gate allowed={can("identity", "edit")}>
                  <Button variant="primary" disabled={!can("identity", "edit")} onClick={onEdit}>
                    Edit
                  </Button>
                </Gate>
                <Gate allowed={can("identity", "delete")}>
                  <Button
                    variant="destructive"
                    disabled={!can("identity", "delete")}
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

export const useAuthMethodFlows = (identity?: OrgIdentity) => {
  const [viewing, setViewing] = useState<AuthMethod>();
  const [form, setForm] = useState<{ method?: AuthMethod; key: number }>();
  const [removing, setRemoving] = useState<AuthMethod>();
  return {
    view: setViewing,
    add: () => setForm({ key: Date.now() }),
    edit: (method: AuthMethod) => setForm({ method, key: Date.now() }),
    remove: setRemoving,
    overlays: (
      <>
        <AuthMethodSheet
          identity={identity}
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
          method={form?.method}
          open={Boolean(form)}
          onOpenChange={(open) => !open && setForm(undefined)}
        />
        <RemoveAuthMethodDialog
          identity={identity}
          method={removing}
          onOpenChange={(open) => !open && setRemoving(undefined)}
        />
      </>
    )
  };
};

export const ProjectIdentityAuthSection = ({ identity }: { identity: OrgIdentity }) => {
  const can = useCan("project");
  const flows = useAuthMethodFlows(identity);
  const locked = lockedMethods(identity);
  const canEdit = can("identity", "edit");
  const addButton = (
    <Gate allowed={canEdit}>
      <Button variant="outline" size="xs" icon="plus" disabled={!canEdit} onClick={flows.add}>
        Add auth method
      </Button>
    </Gate>
  );
  const columns: AccessColumn<AuthMethod>[] = [
    {
      id: "method",
      header: "Auth method",
      render: (method) => (
        <>
          <span>{authMethodNames[method]}</span>
          {locked.includes(method) && <LockedBadge label={ACTIVE_LOCKOUTS} />}
        </>
      )
    },
    {
      id: "actions",
      header: "Actions",
      actions: true,
      render: (method) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-row" icon="more" iconOnly>
              Auth method actions
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => flows.view(method)}>
              <Icon name="eye" />
              View auth method
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!canEdit} onSelect={() => flows.edit(method)}>
              <Icon name="settings" />
              Edit auth method
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              disabled={!can("identity", "delete")}
              onSelect={() => flows.remove(method)}
            >
              <Icon name="trash" />
              Remove auth method
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    }
  ];
  return (
    <>
      <Card
        title="Authentication"
        description="Configure authentication methods"
        flush={identity.authMethods.length > 0}
        action={
          identity.authMethods.length > 0 && identity.authMethods.length < allMethods.length
            ? addButton
            : undefined
        }
      >
        {identity.authMethods.length > 0 ? (
          <AccessTable
            label="Auth methods"
            rows={identity.authMethods}
            columns={columns}
            getRowId={(method) => method}
            rowLabel={(method) => authMethodNames[method]}
            onRowClick={flows.view}
          />
        ) : (
          <EmptyState
            size="sm"
            icon="key"
            title="This machine identity has no auth methods configured"
            description="Add an auth method to use this machine identity"
            actions={
              <Gate allowed={canEdit}>
                <Button
                  variant="primary"
                  size="xs"
                  icon="plus"
                  disabled={!canEdit}
                  onClick={flows.add}
                >
                  Add auth method
                </Button>
              </Gate>
            }
          />
        )}
      </Card>
      {flows.overlays}
    </>
  );
};
