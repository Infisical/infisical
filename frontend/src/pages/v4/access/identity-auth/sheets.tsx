import { useRef, useState } from "react";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import { Alert } from "@infisical/cipher/ui/alert";
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
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Field } from "@infisical/cipher/ui/field";
import { Icon } from "@infisical/cipher/ui/icon";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { DataList } from "@infisical/cipher/ui/list";
import { MultiStep } from "@infisical/cipher/ui/multi-step";
import { Select } from "@infisical/cipher/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@infisical/cipher/ui/sheet";
import { Snippet } from "@infisical/cipher/ui/snippet";

import { IdentityAuthMethod } from "@app/hooks/api/identities/enums";

import { useV4Adapter } from "../../data/adapters";
import { failed, readableFailure, saved } from "../toast";
import { DetailSkeleton, FormSkeleton, Gate } from "../ui";
import { AccessTokens, ClientSecrets } from "./credentials";
import { AUTH_METHOD_SPECS } from "./methods";
import { AUTH_METHOD_ORDER, authMethodName } from "./order";

export { AUTH_METHOD_ORDER, authMethodName, sortedMethods } from "./order";

export type AuthScope = { organizationId: string } | { projectId: string };

export type AuthGates = {
  canEditAuth: boolean;
  canRevokeAuth: boolean;
  canCreateToken: boolean;
  canDeleteToken: boolean;
  canEdit: boolean;
};

export type AuthIdentity = {
  id: string;
  name: string;
  authMethods: readonly IdentityAuthMethod[];
  activeLockoutAuthMethods?: readonly IdentityAuthMethod[];
};

export const LockBadge = ({ label }: { label: string }) => (
  <Badge reason={label} tone="bad" aria-label={label}>
    <Icon name="lock" />
  </Badge>
);

export const ACTIVE_LOCKOUTS = "Auth method has active lockouts";

type Run = (dto: any) => Promise<unknown>;

const useAuthMethodMutations = (): Record<
  IdentityAuthMethod,
  { add: Run; update: Run; remove: Run }
> => {
  const access = useV4Adapter("access");
  const entry = (
    add: { mutateAsync: Run },
    update: { mutateAsync: Run },
    remove: { mutateAsync: Run }
  ) => ({ add: add.mutateAsync, update: update.mutateAsync, remove: remove.mutateAsync });
  return {
    [IdentityAuthMethod.UNIVERSAL_AUTH]: entry(
      access.useAddIdentityUniversalAuth(),
      access.useUpdateIdentityUniversalAuth(),
      access.useDeleteIdentityUniversalAuth()
    ),
    [IdentityAuthMethod.TOKEN_AUTH]: entry(
      access.useAddIdentityTokenAuth(),
      access.useUpdateIdentityTokenAuth(),
      access.useDeleteIdentityTokenAuth()
    ),
    [IdentityAuthMethod.KUBERNETES_AUTH]: entry(
      access.useAddIdentityKubernetesAuth(),
      access.useUpdateIdentityKubernetesAuth(),
      access.useDeleteIdentityKubernetesAuth()
    ),
    [IdentityAuthMethod.AWS_AUTH]: entry(
      access.useAddIdentityAwsAuth(),
      access.useUpdateIdentityAwsAuth(),
      access.useDeleteIdentityAwsAuth()
    ),
    [IdentityAuthMethod.GCP_AUTH]: entry(
      access.useAddIdentityGcpAuth(),
      access.useUpdateIdentityGcpAuth(),
      access.useDeleteIdentityGcpAuth()
    ),
    [IdentityAuthMethod.AZURE_AUTH]: entry(
      access.useAddIdentityAzureAuth(),
      access.useUpdateIdentityAzureAuth(),
      access.useDeleteIdentityAzureAuth()
    ),
    [IdentityAuthMethod.ALICLOUD_AUTH]: entry(
      access.useAddIdentityAliCloudAuth(),
      access.useUpdateIdentityAliCloudAuth(),
      access.useDeleteIdentityAliCloudAuth()
    ),
    [IdentityAuthMethod.OCI_AUTH]: entry(
      access.useAddIdentityOciAuth(),
      access.useUpdateIdentityOciAuth(),
      access.useDeleteIdentityOciAuth()
    ),
    [IdentityAuthMethod.OIDC_AUTH]: entry(
      access.useAddIdentityOidcAuth(),
      access.useUpdateIdentityOidcAuth(),
      access.useDeleteIdentityOidcAuth()
    ),
    [IdentityAuthMethod.JWT_AUTH]: entry(
      access.useAddIdentityJwtAuth(),
      access.useUpdateIdentityJwtAuth(),
      access.useDeleteIdentityJwtAuth()
    ),
    [IdentityAuthMethod.LDAP_AUTH]: entry(
      access.useAddIdentityLdapAuth(),
      access.useUpdateIdentityLdapAuth(),
      access.useDeleteIdentityLdapAuth()
    ),
    [IdentityAuthMethod.TLS_CERT_AUTH]: entry(
      access.useAddIdentityTlsCertAuth(),
      access.useUpdateIdentityTlsCertAuth(),
      access.useDeleteIdentityTlsCertAuth()
    ),
    [IdentityAuthMethod.SPIFFE_AUTH]: entry(
      access.useAddIdentitySpiffeAuth(),
      access.useUpdateIdentitySpiffeAuth(),
      access.useDeleteIdentitySpiffeAuth()
    )
  };
};

type FormProps = {
  identity: AuthIdentity;
  scope: AuthScope;
  onClose: () => void;
};

const ADD_COPY = { run: "add", done: "added", complete: "Add" } as const;
const UPDATE_COPY = { run: "update", done: "updated", complete: "Save" } as const;

const MethodPicker = ({
  value,
  configured,
  onChange
}: {
  value?: IdentityAuthMethod;
  configured: readonly IdentityAuthMethod[];
  onChange: (method: IdentityAuthMethod) => void;
}) => (
  <Field label="Auth method">
    <Select
      label="Auth method"
      placeholder="Select auth method..."
      value={value ?? ""}
      options={AUTH_METHOD_ORDER.map((method) => ({
        value: method,
        label: authMethodName(method),
        disabled: configured.includes(method),
        meta: configured.includes(method) ? "Configured" : undefined
      }))}
      onChange={(next) => onChange(next as IdentityAuthMethod)}
    />
  </Field>
);

const AuthMethodForm = ({
  identity,
  scope,
  onClose,
  initialMethod,
  isUpdate,
  config,
  loading
}: FormProps & {
  initialMethod?: IdentityAuthMethod;
  isUpdate: boolean;
  config?: unknown;
  loading?: boolean;
}) => {
  const configured = identity.authMethods;
  const [method, setMethod] = useState(
    () => initialMethod ?? AUTH_METHOD_ORDER.find((entry) => !configured.includes(entry))
  );
  const [edited, setEdited] = useState<unknown>();
  const completed = useRef(false);
  const mutations = useAuthMethodMutations();
  const spec = method ? AUTH_METHOD_SPECS[method] : undefined;
  const access = useV4Adapter("access");
  const ctx = { isUpdate, config, maxTtl: access.useIdentityAccessTokenMaxTtl() };
  const baseline = spec && !loading ? spec.draft(config) : undefined;
  const draft = edited ?? baseline;
  const copy = isUpdate ? UPDATE_COPY : ADD_COPY;
  const isDirty =
    !completed.current &&
    edited !== undefined &&
    JSON.stringify(edited) !== JSON.stringify(baseline);
  const { requestDiscard, discardDialogProps } = useDiscardChangesGuard({
    isDirty,
    onDiscard: onClose
  });

  const submit = async () => {
    if (!method || !spec) return;
    await mutations[method]
      [copy.run]({
        identityId: identity.id,
        ...scope,
        ...spec.payload(draft, ctx)
      })
      .catch(readableFailure(`Couldn't ${copy.run} ${authMethodName(method)}`));
    saved(`${authMethodName(method)} ${copy.done}`);
    completed.current = true;
    onClose();
  };

  let content = <FormSkeleton label="Loading auth method" />;
  if (spec && draft)
    content = (
      <Stack gap={24}>
        {!isUpdate && (
          <MethodPicker
            value={method}
            configured={configured}
            onChange={(next) => {
              setMethod(next);
              setEdited(undefined);
            }}
          />
        )}
        {spec.fields({
          draft,
          ctx,
          set: (patch: object) => setEdited({ ...(draft as object), ...patch })
        })}
      </Stack>
    );

  return (
    <>
      <MultiStep
        variant="sheet"
        open
        title={isUpdate && method ? `Edit ${authMethodName(method)}` : "Add auth method"}
        completeLabel={copy.complete}
        onOpenChange={(open) => {
          if (open) return;
          if (completed.current) onClose();
          else requestDiscard();
        }}
        onComplete={submit}
        steps={[
          {
            title: method ? authMethodName(method) : "Auth method",
            disabledReason: draft ? undefined : "Loading auth method",
            validate: () => {
              if (!spec) return false;
              const errors = spec.validate(draft, ctx);
              return Object.keys(errors).length ? { fields: errors } : true;
            },
            content
          }
        ]}
      />
      <DiscardChangesAlertDialog
        {...discardDialogProps}
        title="Discard changes to this auth method?"
      />
    </>
  );
};

const EditAuthMethodForm = ({ method, ...props }: FormProps & { method: IdentityAuthMethod }) => {
  const { data, isPending } = AUTH_METHOD_SPECS[method].useConfig(props.identity.id, true);
  if (!isPending && !data)
    return (
      <Sheet open onOpenChange={(open) => !open && props.onClose()}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{`Edit ${authMethodName(method)}`}</SheetTitle>
          </SheetHeader>
          <SheetBody>
            <EmptyState size="sm" icon="lock" title={`Couldn't load ${authMethodName(method)}`} />
          </SheetBody>
        </SheetContent>
      </Sheet>
    );
  return (
    <AuthMethodForm {...props} initialMethod={method} isUpdate config={data} loading={isPending} />
  );
};

export const AuthMethodFormSheet = ({
  identity,
  scope,
  method,
  open,
  onOpenChange
}: {
  identity: AuthIdentity;
  scope: AuthScope;
  method?: IdentityAuthMethod;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  if (!open) return null;
  const onClose = () => onOpenChange(false);
  if (method && identity.authMethods.includes(method))
    return (
      <EditAuthMethodForm
        key={method}
        identity={identity}
        scope={scope}
        method={method}
        onClose={onClose}
      />
    );
  return (
    <AuthMethodForm
      identity={identity}
      scope={scope}
      initialMethod={method}
      isUpdate={false}
      onClose={onClose}
    />
  );
};

const LockoutAlert = ({
  identityId,
  method,
  canEdit
}: {
  identityId: string;
  method: IdentityAuthMethod;
  canEdit: boolean;
}) => {
  const access = useV4Adapter("access");
  const clearUniversal = access.useClearIdentityUniversalAuthLockouts();
  const clearLdap = access.useClearIdentityLdapAuthLockouts();
  const [pending, setPending] = useState(false);
  const clear = method === IdentityAuthMethod.LDAP_AUTH ? clearLdap : clearUniversal;
  return (
    <Alert
      tone="bad"
      title={ACTIVE_LOCKOUTS}
      actions={
        <Gate allowed={canEdit}>
          <Button
            variant="outline"
            size="xs"
            disabled={!canEdit}
            loading={pending}
            onClick={async () => {
              setPending(true);
              try {
                const count = await clear.mutateAsync({ identityId });
                saved(`Cleared ${count} lockout${count === 1 ? "" : "s"}`);
              } catch (error) {
                failed("Couldn't reset lockouts", error);
              } finally {
                setPending(false);
              }
            }}
          >
            Reset all lockouts
          </Button>
        </Gate>
      }
    >
      Clients can&apos;t sign in with this method until the lockout ends or is reset.
    </Alert>
  );
};

const MethodDetails = ({
  identity,
  method,
  gates
}: {
  identity: AuthIdentity;
  method: IdentityAuthMethod;
  gates: AuthGates;
}) => {
  const spec = AUTH_METHOD_SPECS[method];
  const { data: config, isPending } = spec.useConfig(identity.id, true);
  const locked = Boolean(identity.activeLockoutAuthMethods?.includes(method));
  if (isPending) return <DetailSkeleton label={`Loading ${authMethodName(method)}`} />;
  if (!config)
    return (
      <EmptyState
        size="sm"
        icon="lock"
        title={`Could not find ${authMethodName(method)} on this machine identity`}
      />
    );
  return (
    <Stack gap={24}>
      {locked && <LockoutAlert identityId={identity.id} method={method} canEdit={gates.canEdit} />}
      {method === IdentityAuthMethod.UNIVERSAL_AUTH && (
        <Field label="Client ID">
          <Snippet label="Client ID" copyLabel="Copy client ID" value={config.clientId} />
        </Field>
      )}
      <DataList variant="props" items={spec.details(config)} />
      {spec
        .certificates?.(config)
        .filter(([, value]) => value?.trim())
        .map(([label, value]) => (
          <Field key={label} label={label}>
            <Snippet label={label} copyLabel={`Copy ${label}`} value={value ?? ""} maxLines={8} />
          </Field>
        ))}
      {method === IdentityAuthMethod.UNIVERSAL_AUTH && (
        <ClientSecrets
          identityId={identity.id}
          canCreate={gates.canCreateToken}
          canRevoke={gates.canDeleteToken}
        />
      )}
      {method === IdentityAuthMethod.TOKEN_AUTH && (
        <AccessTokens
          identityId={identity.id}
          canCreate={gates.canCreateToken}
          canRevoke={gates.canEdit}
        />
      )}
    </Stack>
  );
};

export const AuthMethodViewSheet = ({
  identity,
  method,
  open,
  onOpenChange,
  onEdit,
  onRemove,
  gates
}: {
  identity: AuthIdentity;
  method?: IdentityAuthMethod;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
  onRemove: () => void;
  gates: AuthGates;
}) => {
  const locked = Boolean(method && identity.activeLockoutAuthMethods?.includes(method));
  return (
    <Sheet open={open && Boolean(method)} onOpenChange={onOpenChange}>
      <SheetContent>
        {method && (
          <>
            <SheetHeader>
              <SheetTitle>
                <Inline gap={8}>
                  {authMethodName(method)}
                  {locked && <LockBadge label={ACTIVE_LOCKOUTS} />}
                </Inline>
              </SheetTitle>
            </SheetHeader>
            <SheetBody>
              <MethodDetails key={method} identity={identity} method={method} gates={gates} />
            </SheetBody>
            <SheetFooter>
              <Inline gap={8} justify="end">
                <Gate allowed={gates.canRevokeAuth}>
                  <Button variant="destructive" disabled={!gates.canRevokeAuth} onClick={onRemove}>
                    Remove
                  </Button>
                </Gate>
                <Gate allowed={gates.canEditAuth}>
                  <Button variant="primary" disabled={!gates.canEditAuth} onClick={onEdit}>
                    Edit
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

export const RemoveAuthMethodDialog = ({
  identity,
  scope,
  method,
  onClose
}: {
  identity?: AuthIdentity;
  scope: AuthScope;
  method?: IdentityAuthMethod;
  onClose: () => void;
}) => {
  const mutations = useAuthMethodMutations();
  const [pending, setPending] = useState(false);
  const run = async () => {
    if (!identity || !method) return;
    setPending(true);
    try {
      await mutations[method].remove({ identityId: identity.id, ...scope });
      saved(`${authMethodName(method)} removed`);
      onClose();
    } catch (error) {
      failed(`Couldn't remove ${authMethodName(method)}`, error);
    } finally {
      setPending(false);
    }
  };
  return (
    <AlertDialog open={Boolean(identity && method)} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent tone="danger" confirmText="confirm" pending={pending}>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {`Remove ${method ? authMethodName(method) : "auth method"} from ${identity?.name ?? "this machine identity"}?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Clients using it can no longer authenticate, and its configuration and issued
            credentials are deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            loading={pending}
            onClick={(event) => {
              event.preventDefault();
              run();
            }}
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
