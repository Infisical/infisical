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
import { Tooltip } from "@infisical/cipher/ui/tooltip";

import { identityAuthToNameMap } from "@app/hooks/api/identities/constants";
import { IdentityAuthMethod } from "@app/hooks/api/identities/enums";

import { useV4Adapter } from "../../data/adapters";
import { failed, readableFailure, saved } from "../toast";
import { DetailSkeleton, FormSkeleton, Gate } from "../ui";
import { AccessTokens, ClientSecrets } from "./credentials";
import { AUTH_METHOD_SPECS } from "./methods";

export type AuthScope = { organizationId: string } | { projectId: string };

export type AuthIdentity = {
  id: string;
  name: string;
  authMethods: readonly IdentityAuthMethod[];
  activeLockoutAuthMethods?: readonly IdentityAuthMethod[];
};

export const authMethodName = (method: IdentityAuthMethod) => identityAuthToNameMap[method];

export const AUTH_METHOD_ORDER: IdentityAuthMethod[] = [
  IdentityAuthMethod.UNIVERSAL_AUTH,
  IdentityAuthMethod.TOKEN_AUTH,
  ...Object.values(IdentityAuthMethod)
    .filter(
      (method) =>
        method !== IdentityAuthMethod.UNIVERSAL_AUTH && method !== IdentityAuthMethod.TOKEN_AUTH
    )
    .sort((a, b) => authMethodName(a).localeCompare(authMethodName(b)))
];

export const sortedMethods = (methods: readonly IdentityAuthMethod[]) =>
  AUTH_METHOD_ORDER.filter((method) => methods.includes(method));

export const LockBadge = ({ label }: { label: string }) => (
  <Tooltip content={label}>
    <Badge tone="bad" aria-label={label}>
      <Icon name="lock" size={12} />
    </Badge>
  </Tooltip>
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
  const [edited, setEdited] = useState<{ method: IdentityAuthMethod; draft: unknown }>();
  const completed = useRef(false);
  const mutations = useAuthMethodMutations();
  const spec = method ? AUTH_METHOD_SPECS[method] : undefined;
  const ctx = { isUpdate, config };
  const baseline = spec && !loading ? spec.draft(config) : undefined;
  const draft = edited && edited.method === method ? edited.draft : baseline;
  const isDirty =
    !completed.current &&
    Boolean(edited) &&
    edited?.method === method &&
    JSON.stringify(edited?.draft) !== JSON.stringify(baseline);
  const { requestDiscard, discardDialogProps } = useDiscardChangesGuard({
    isDirty,
    onDiscard: onClose
  });

  const submit = async () => {
    if (!method || !spec) return;
    const run = isUpdate ? mutations[method].update : mutations[method].add;
    await run({ identityId: identity.id, ...scope, ...spec.payload(draft, ctx) }).catch(
      readableFailure(`Couldn't ${isUpdate ? "update" : "add"} ${authMethodName(method)}`)
    );
    saved(`${authMethodName(method)} ${isUpdate ? "updated" : "added"}`);
    completed.current = true;
    onClose();
  };

  let content = <FormSkeleton label="Loading auth method" />;
  if (spec && draft)
    content = (
      <Stack gap={24}>
        {!isUpdate && (
          <Field label="Auth method">
            <Select
              label="Auth method"
              placeholder="Select auth method..."
              value={method ?? ""}
              options={AUTH_METHOD_ORDER.map((value) => ({
                value,
                label: authMethodName(value),
                disabled: configured.includes(value),
                description: configured.includes(value) ? "Configured" : undefined
              }))}
              onChange={(value) => setMethod(value as IdentityAuthMethod)}
            />
          </Field>
        )}
        {spec.fields({
          draft,
          ctx,
          set: (patch: object) =>
            setEdited({ method: method!, draft: { ...(draft as object), ...patch } })
        })}
      </Stack>
    );

  return (
    <>
      <MultiStep
        variant="sheet"
        open
        title={isUpdate && method ? `Edit ${authMethodName(method)}` : "Add auth method"}
        completeLabel={isUpdate ? "Save" : "Add"}
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
  canEdit
}: {
  identity: AuthIdentity;
  method: IdentityAuthMethod;
  canEdit: boolean;
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
      {locked && <LockoutAlert identityId={identity.id} method={method} canEdit={canEdit} />}
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
        <ClientSecrets identityId={identity.id} canEdit={canEdit} />
      )}
      {method === IdentityAuthMethod.TOKEN_AUTH && (
        <AccessTokens identityId={identity.id} canEdit={canEdit} />
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
  canEditAuth,
  canEdit,
  canDelete
}: {
  identity: AuthIdentity;
  method?: IdentityAuthMethod;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
  onRemove: () => void;
  canEditAuth: boolean;
  canEdit: boolean;
  canDelete: boolean;
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
              <MethodDetails key={method} identity={identity} method={method} canEdit={canEdit} />
            </SheetBody>
            <SheetFooter>
              <Inline gap={8} justify="end">
                <Gate allowed={canDelete}>
                  <Button variant="destructive" disabled={!canDelete} onClick={onRemove}>
                    Remove
                  </Button>
                </Gate>
                <Gate allowed={canEditAuth}>
                  <Button variant="primary" disabled={!canEditAuth} onClick={onEdit}>
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
