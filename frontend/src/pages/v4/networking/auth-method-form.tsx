import {
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useEffect,
  useId
} from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button } from "@app/components/v4/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { ProviderIcon } from "@app/components/v4/ui/provider-icon";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v4/ui/select";
import { Switch } from "@app/components/v4/ui/switch";
import { Textarea } from "@app/components/v4/ui/textarea";
import { Tooltip } from "@app/components/v4/ui/tooltip";

import { useOrgId } from "../access/permissions";
import { Gate } from "../access/ui";
import { useV4Adapter } from "../data/adapters";
import { GatewayPicker } from "./gateway-picker";

export type NetworkingAuthMethod = "aws" | "gcp" | "kubernetes" | "token";

export const NETWORKING_AUTH_METHOD_OPTIONS: { value: NetworkingAuthMethod; label: string }[] = [
  { value: "token", label: "Token Auth" },
  { value: "aws", label: "AWS Auth" },
  { value: "gcp", label: "GCP Auth" },
  { value: "kubernetes", label: "Kubernetes Auth" }
];

const METHOD_ICONS: Partial<Record<NetworkingAuthMethod, string>> = {
  aws: "Amazon Web Services.png",
  gcp: "Google Cloud Platform.png",
  kubernetes: "Kubernetes.png"
};

export const NetworkingAuthMethodLabel = ({
  method,
  label
}: {
  method: NetworkingAuthMethod;
  label?: string;
}) => (
  <Inline gap={8} wrap={false}>
    {METHOD_ICONS[method] ? (
      <ProviderIcon icon={METHOD_ICONS[method] as string} alt="" size="sm" />
    ) : (
      <Icon name="key" />
    )}
    <span>
      {label ?? NETWORKING_AUTH_METHOD_OPTIONS.find(({ value }) => value === method)?.label}
    </span>
  </Inline>
);

const GCP_AUTH_TYPE_OPTIONS = [
  { value: "gce", label: "GCP ID token auth (recommended)" },
  { value: "iam", label: "GCP IAM auth" }
];

const REVIEW_MODE_OPTIONS = [
  { value: "gateway", label: "Gateway as reviewer" },
  { value: "api", label: "Manual token reviewer JWT (API)" }
];

const schema = z
  .object({
    method: z.enum(["aws", "gcp", "kubernetes", "token"]),
    allowedPrincipalArns: z.string(),
    allowedAccountIds: z.string(),
    gcpAuthType: z.enum(["gce", "iam"]),
    allowedServiceAccounts: z.string(),
    allowedProjects: z.string(),
    allowedZones: z.string(),
    kubernetesHost: z.string(),
    caCertificate: z.string(),
    tokenReviewerJwt: z.string(),
    allowedNamespaces: z.string(),
    allowedNames: z.string(),
    allowedAudience: z.string(),
    verifyTlsCertificate: z.boolean(),
    // "gateway" hands the review to the proxying gateway's own service account, which needs no
    // host and no reviewer token but requires that gateway to run as a pod in the cluster.
    tokenReviewMode: z.enum(["api", "gateway"]),
    // Empty string means no proxy: review straight from Infisical. Only one may be set.
    gatewayId: z.string(),
    gatewayPoolId: z.string(),
    // True once Reset is chosen, which swaps the stored token for an editable field. Saving with
    // that field empty is what removes the token, since a never-returned value cannot be blanked.
    resetTokenReviewerJwt: z.boolean()
  })
  .superRefine((data, ctx) => {
    if (
      data.method === "aws" &&
      !data.allowedPrincipalArns.trim() &&
      !data.allowedAccountIds.trim()
    ) {
      const message = "At least one of allowed principal ARNs or allowed account IDs must be set";
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["allowedPrincipalArns"], message });
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["allowedAccountIds"], message });
    }

    if (data.method === "gcp") {
      // Projects are not offered on the iam type, so only the service account can satisfy it there.
      const isIam = data.gcpAuthType === "iam";
      if (!data.allowedServiceAccounts.trim() && (isIam || !data.allowedProjects.trim())) {
        const message = isIam
          ? "Allowed service account emails must be set"
          : "At least one of allowed service account emails or allowed projects must be set";
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["allowedServiceAccounts"], message });
        if (!isIam)
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["allowedProjects"], message });
      }
    }

    if (data.method === "kubernetes") {
      const isGatewayReviewer = data.tokenReviewMode === "gateway";
      if (!isGatewayReviewer && !data.kubernetesHost.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["kubernetesHost"],
          message: "Kubernetes host is required"
        });
      }
      if (isGatewayReviewer && !data.gatewayId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["gatewayId"],
          message: "Select a specific gateway to perform the review; a pool cannot"
        });
      }
      if (!data.allowedNamespaces.trim() && !data.allowedNames.trim()) {
        const message =
          "At least one of allowed namespaces or allowed service account names must be set";
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["allowedNamespaces"], message });
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["allowedNames"], message });
      }
    }
  });

export type NetworkingAuthMethodFormData = z.infer<typeof schema>;

type FormData = NetworkingAuthMethodFormData;

const toTokenReviewerJwtInput = (form: FormData) => {
  if (form.tokenReviewerJwt.trim()) return form.tokenReviewerJwt;
  return form.resetTokenReviewerJwt ? "" : undefined;
};

export const toNetworkingAuthMethodInput = (form: FormData) => {
  if (form.method === "aws") {
    return {
      method: "aws" as const,
      allowedPrincipalArns: form.allowedPrincipalArns,
      allowedAccountIds: form.allowedAccountIds
    };
  }

  if (form.method === "gcp") {
    // Hidden on the iam type, so a leftover gce value must not be submitted.
    const isIam = form.gcpAuthType === "iam";
    return {
      method: "gcp" as const,
      type: form.gcpAuthType,
      allowedServiceAccounts: form.allowedServiceAccounts,
      allowedProjects: isIam ? "" : form.allowedProjects,
      allowedZones: isIam ? "" : form.allowedZones
    };
  }

  if (form.method === "kubernetes") {
    const isGatewayReviewer = form.tokenReviewMode === "gateway";
    return {
      method: "kubernetes" as const,
      // The gateway resolves its own API server, so sending a host would be meaningless.
      kubernetesHost: isGatewayReviewer ? undefined : form.kubernetesHost,
      tokenReviewMode: form.tokenReviewMode,
      gatewayId: form.gatewayId || null,
      gatewayPoolId: form.gatewayPoolId || null,
      caCertificate: form.caCertificate,
      // Write-only: undefined keeps the stored value, empty string removes it.
      tokenReviewerJwt: toTokenReviewerJwtInput(form),
      allowedNamespaces: form.allowedNamespaces,
      allowedNames: form.allowedNames,
      allowedAudience: form.allowedAudience,
      verifyTlsCertificate: form.verifyTlsCertificate
    };
  }

  return { method: "token" as const };
};

export type NetworkingAuthMethodView =
  | { method: "aws"; config: { allowedPrincipalArns: string; allowedAccountIds: string } }
  | {
      method: "gcp";
      config: {
        type: "gce" | "iam";
        allowedServiceAccounts: string;
        allowedProjects: string;
        allowedZones: string;
      };
    }
  | {
      method: "kubernetes";
      config: {
        kubernetesHost: string;
        allowedNamespaces: string;
        allowedNames: string;
        allowedAudience: string;
        verifyTlsCertificate: boolean;
        caCertificate: string;
        hasTokenReviewerJwt: boolean;
        tokenReviewMode: string;
        gatewayId: string | null;
        gatewayPoolId: string | null;
      };
    }
  | { method: "token"; config?: unknown };

const InfoTip = ({ content, label }: { content: ReactNode; label: string }) => (
  <Tooltip content={content}>
    <Button type="button" variant="ghost" size="icon-xs" icon="info" iconOnly>
      {label}
    </Button>
  </Tooltip>
);

const HintField = ({
  label,
  hint,
  optional,
  description,
  error,
  children
}: {
  label: string;
  hint?: ReactNode;
  optional?: boolean;
  description?: string;
  error?: string;
  children: ReactElement<Record<string, unknown>>;
}) => {
  const id = useId();
  const noteId = `${id}-note`;
  const control = isValidElement(children)
    ? cloneElement(children, {
        id,
        "aria-invalid": Boolean(error) || undefined,
        "aria-describedby": error || description ? noteId : undefined
      })
    : children;
  return (
    <Field data-invalid={Boolean(error) || undefined}>
      <Inline gap={4} wrap={false}>
        <FieldLabel htmlFor={id}>
          {label}
          {optional && " (optional)"}
        </FieldLabel>
        {hint && <InfoTip content={hint} label={`About ${label.toLowerCase()}`} />}
      </Inline>
      {control}
      {error ? (
        <FieldError id={noteId}>{error}</FieldError>
      ) : (
        description && <FieldDescription id={noteId}>{description}</FieldDescription>
      )}
    </Field>
  );
};

const Paragraphs = ({ children }: { children: string[] }) => (
  <Stack gap={4}>
    {children.map((line) => (
      <p key={line}>{line}</p>
    ))}
  </Stack>
);

export const NetworkingAuthMethodForm = ({
  currentMethod,
  disabledReason,
  isPending,
  availableMethods = ["token", "aws"],
  currentGatewayId,
  onUpdate
}: {
  currentMethod: NetworkingAuthMethodView;
  disabledReason?: string;
  isPending: boolean;
  // Kubernetes auth is gateway-only, since only gateways run inside the cluster.
  availableMethods?: NetworkingAuthMethod[];
  // Excluded from the proxy picker: a gateway cannot review its own token.
  currentGatewayId?: string;
  onUpdate: (form: FormData) => Promise<boolean>;
}) => {
  const orgId = useOrgId();
  const { data: org } = useV4Adapter("org").useOrganization(orgId);
  const initialAws = currentMethod.method === "aws" ? currentMethod.config : undefined;
  const initialGcp = currentMethod.method === "gcp" ? currentMethod.config : undefined;
  const initialKubernetes =
    currentMethod.method === "kubernetes" ? currentMethod.config : undefined;
  const methodOptions = NETWORKING_AUTH_METHOD_OPTIONS.filter(({ value }) =>
    availableMethods.includes(value)
  );
  const defaultValues: FormData = {
    method: currentMethod.method,
    allowedPrincipalArns: initialAws?.allowedPrincipalArns ?? "",
    allowedAccountIds: initialAws?.allowedAccountIds ?? "",
    gcpAuthType: initialGcp?.type ?? "gce",
    allowedServiceAccounts: initialGcp?.allowedServiceAccounts ?? "",
    allowedProjects: initialGcp?.allowedProjects ?? "",
    allowedZones: initialGcp?.allowedZones ?? "",
    kubernetesHost: initialKubernetes?.kubernetesHost ?? "",
    caCertificate: initialKubernetes?.caCertificate ?? "",
    tokenReviewerJwt: "",
    allowedNamespaces: initialKubernetes?.allowedNamespaces ?? "",
    allowedNames: initialKubernetes?.allowedNames ?? "",
    allowedAudience: initialKubernetes?.allowedAudience ?? "",
    verifyTlsCertificate: initialKubernetes?.verifyTlsCertificate ?? true,
    tokenReviewMode: initialKubernetes?.tokenReviewMode === "gateway" ? "gateway" : "api",
    gatewayId: initialKubernetes?.gatewayId ?? "",
    gatewayPoolId: initialKubernetes?.gatewayPoolId ?? "",
    resetTokenReviewerJwt: false
  };

  const {
    control,
    handleSubmit,
    watch,
    reset,
    setValue,
    trigger,
    formState: { isSubmitting, isDirty, isSubmitted }
  } = useForm<FormData>({ resolver: zodResolver(schema), defaultValues });

  useEffect(() => {
    reset(defaultValues);
    // The individual method values below are the server-backed reset boundary.
  }, [
    currentMethod.method,
    initialAws?.allowedPrincipalArns,
    initialAws?.allowedAccountIds,
    initialGcp?.type,
    initialGcp?.allowedServiceAccounts,
    initialGcp?.allowedProjects,
    initialGcp?.allowedZones,
    initialKubernetes?.kubernetesHost,
    initialKubernetes?.allowedNamespaces,
    initialKubernetes?.allowedNames,
    initialKubernetes?.allowedAudience,
    initialKubernetes?.verifyTlsCertificate,
    initialKubernetes?.caCertificate,
    initialKubernetes?.tokenReviewMode,
    initialKubernetes?.gatewayId,
    initialKubernetes?.gatewayPoolId,
    reset
  ]);

  const method = watch("method");
  const isSaving = isSubmitting || isPending;
  const locked = Boolean(disabledReason) || isSaving;
  const verifyTlsCertificate = watch("verifyTlsCertificate");
  const gcpAuthType = watch("gcpAuthType");
  const tokenReviewMode = watch("tokenReviewMode");
  const gatewayId = watch("gatewayId");
  const gatewayPoolId = watch("gatewayPoolId");
  const isProxied = Boolean(gatewayId || gatewayPoolId);
  const isGatewayReviewer = tokenReviewMode === "gateway";
  // Under the org's pool requirement the backend only accepts a new individual gateway as the
  // reviewer, since a pool can't perform the review. A gateway the config already had in API mode is
  // kept as is; one saved as the reviewer was only allowed for that mode, so it stays in it.
  const isPoolRequired = Boolean(org?.requireGatewayPools);
  const isKeptApiGateway =
    gatewayId === initialKubernetes?.gatewayId && initialKubernetes?.tokenReviewMode !== "gateway";
  const mustUseGatewayReviewer = isPoolRequired && Boolean(gatewayId) && !isKeptApiGateway;
  const isTokenReviewerJwtConfigured =
    Boolean(initialKubernetes?.hasTokenReviewerJwt) && !watch("resetTokenReviewerJwt");

  const submit = async (form: FormData) => {
    if (await onUpdate(form)) {
      // Drop the reviewer token from form state so a saved one collapses back to Configured
      // instead of leaving the value on screen.
      reset({ ...form, tokenReviewerJwt: "", resetTokenReviewerJwt: false });
    }
  };

  const text = (
    name:
      | "allowedPrincipalArns"
      | "allowedAccountIds"
      | "allowedServiceAccounts"
      | "allowedProjects"
      | "allowedZones"
      | "kubernetesHost"
      | "allowedNamespaces"
      | "allowedNames"
      | "allowedAudience",
    label: string,
    placeholder: string,
    options: { hint?: ReactNode; optional?: boolean } = {}
  ) => (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState: { error } }) => (
        <HintField label={label} error={error?.message} {...options}>
          <Input
            {...field}
            mono
            autoComplete="off"
            disabled={locked}
            invalid={Boolean(error)}
            placeholder={placeholder}
          />
        </HintField>
      )}
    />
  );

  return (
    <form onSubmit={handleSubmit(submit)}>
      <Stack gap={16}>
        <Controller
          control={control}
          name="method"
          render={({ field }) => (
            <Gate allowed={!disabledReason} reason={disabledReason}>
              <Select value={field.value} onValueChange={field.onChange} disabled={locked}>
                <SelectTrigger aria-label="Authentication method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {methodOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <NetworkingAuthMethodLabel method={option.value} label={option.label} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Gate>
          )}
        />

        {method === "aws" && (
          <>
            {text(
              "allowedPrincipalArns",
              "Allowed principal ARNs",
              "arn:aws:iam::123456789012:role/MyRoleName, ..."
            )}
            {text("allowedAccountIds", "Allowed account IDs", "123456789012, ...")}
          </>
        )}

        {method === "gcp" && (
          <>
            <Controller
              control={control}
              name="gcpAuthType"
              render={({ field }) => (
                <HintField
                  label="Type"
                  hint="GCP ID token auth reads an identity token from the instance metadata server, which covers Compute Engine VMs and GKE workload identity. GCP IAM auth signs a token through the IAM Credentials API, for hosts outside Compute Engine."
                >
                  <Select
                    label="Type"
                    value={field.value}
                    options={GCP_AUTH_TYPE_OPTIONS}
                    disabled={locked}
                    onValueChange={field.onChange}
                  />
                </HintField>
              )}
            />
            {text(
              "allowedServiceAccounts",
              "Allowed service account emails",
              "test@project.iam.gserviceaccount.com, 12345-compute@developer.gserviceaccount.com",
              {
                optional: true,
                hint: "A comma-separated list of service account emails. A login is accepted when the service account in the token matches one of them."
              }
            )}
            {gcpAuthType === "gce" && (
              <>
                {text("allowedProjects", "Allowed projects", "my-gcp-project, ...", {
                  optional: true,
                  hint: "A comma-separated list of GCP project IDs whose Compute Engine instances may authenticate as this gateway. Every instance in the project is trusted, so prefer a service account where you can."
                })}
                {text("allowedZones", "Allowed zones", "us-west2-a, us-central1-a, ...", {
                  optional: true,
                  hint: "A comma-separated list of GCP zones whose Compute Engine instances may authenticate as this gateway."
                })}
              </>
            )}
            <FieldDescription>
              {gcpAuthType === "gce"
                ? "At least one of allowed service account emails or allowed projects must be set."
                : "Allowed service account emails must be set."}
            </FieldDescription>
          </>
        )}

        {method === "kubernetes" && (
          <>
            <Controller
              control={control}
              name="gatewayId"
              render={({ field, fieldState: { error } }) => (
                <HintField
                  label="Gateway"
                  optional
                  error={error?.message}
                  description={
                    isPoolRequired
                      ? "Your organization requires gateway pools. You can still select an individual gateway here, but only with Gateway as reviewer, because a pool can't perform the review."
                      : undefined
                  }
                  hint="Routes the TokenReview through an existing gateway, for clusters whose API server Infisical cannot reach. It must be a different gateway that is already enrolled and connected, since a gateway cannot vouch for itself."
                >
                  <GatewayPicker
                    label="Gateway"
                    value={{ gatewayId: field.value || null, gatewayPoolId: gatewayPoolId || null }}
                    onChange={(next) => {
                      setValue("gatewayId", next.gatewayId ?? "", { shouldDirty: true });
                      setValue("gatewayPoolId", next.gatewayPoolId ?? "", { shouldDirty: true });
                      // Without a proxy there is nobody to hand the review to.
                      if (!next.gatewayId && !next.gatewayPoolId) {
                        setValue("tokenReviewMode", "api", { shouldDirty: true });
                      }
                      if (
                        isPoolRequired &&
                        next.gatewayId &&
                        next.gatewayId !== initialKubernetes?.gatewayId
                      ) {
                        setValue("tokenReviewMode", "gateway", { shouldDirty: true });
                      }
                      // A pool can't perform the review, so Gateway as reviewer never applies to one.
                      if (next.gatewayPoolId) {
                        setValue("tokenReviewMode", "api", { shouldDirty: true });
                      }
                      // Clears a stale review mode error from an earlier submit.
                      if (isSubmitted) trigger("gatewayId");
                    }}
                    disabled={locked}
                    invalid={Boolean(error)}
                    excludeGatewayId={currentGatewayId}
                    allowIndividualGateways
                  />
                </HintField>
              )}
            />
            {isProxied && (
              <Controller
                control={control}
                name="tokenReviewMode"
                render={({ field, fieldState: { error } }) => (
                  <HintField
                    label="Review mode"
                    error={error?.message}
                    hint="Who performs the TokenReview. Gateway as reviewer has the gateway do it with its own service account, which needs no host or reviewer token but requires that gateway to run as a pod in the cluster. Manual token reviewer JWT has Infisical do it, tunnelling through the gateway to the host below."
                  >
                    <Select
                      label="Review mode"
                      value={field.value}
                      disabled={locked}
                      options={REVIEW_MODE_OPTIONS.map((option) => ({
                        ...option,
                        disabled: option.value === "api" && mustUseGatewayReviewer
                      }))}
                      onValueChange={field.onChange}
                    />
                  </HintField>
                )}
              />
            )}
            {!isGatewayReviewer &&
              text(
                "kubernetesHost",
                "Kubernetes host / base Kubernetes API URL",
                "https://my-example-k8s-api-host.com",
                {
                  hint: (
                    <Paragraphs>
                      {[
                        "The host string, host:port pair, or URL to the base of the Kubernetes API server. This can usually be obtained by running 'kubectl cluster-info'.",
                        "Must be reachable from Infisical, which reviews the token on each login."
                      ]}
                    </Paragraphs>
                  )
                }
              )}
            {text("allowedNamespaces", "Allowed namespaces", "namespaceA, namespaceB, dev-*", {
              hint: (
                <Paragraphs>
                  {[
                    "A comma-separated list of trusted namespaces that service accounts must belong to authenticate as this gateway.",
                    "Wildcard patterns are supported. Use * to explicitly allow all. Examples: dev-*, staging-*",
                    "At least one of allowed namespaces or service account names is required."
                  ]}
                </Paragraphs>
              )
            })}
            {text(
              "allowedNames",
              "Allowed service account names",
              "service-account-1-name, sa-*, app-*-prod",
              {
                hint: (
                  <Paragraphs>
                    {[
                      "A comma-separated list of trusted service account names that are allowed to authenticate as this gateway.",
                      "Wildcard patterns are supported. Use * to explicitly allow all. Examples: dev-*, app-*-prod",
                      "At least one of allowed namespaces or service account names is required."
                    ]}
                  </Paragraphs>
                )
              }
            )}
            {text("allowedAudience", "Allowed audience", "https://kubernetes.default.svc", {
              optional: true,
              hint: "An optional audience claim that the service account JWT token must have to authenticate with Infisical. Leave empty to allow any audience claim."
            })}
            {!isGatewayReviewer && (
              <>
                <Controller
                  control={control}
                  name="verifyTlsCertificate"
                  render={({ field }) => (
                    <Inline gap={4} wrap={false}>
                      <Switch
                        label="Verify TLS certificate"
                        checked={field.value}
                        onChange={field.onChange}
                        disabled={locked}
                      />
                      <InfoTip
                        label="About verify TLS certificate"
                        content={
                          <Paragraphs>
                            {[
                              "When enabled, Infisical validates the Kubernetes API server's TLS certificate against the CA certificate below.",
                              "With a CA certificate below, the server is verified against it. Without one the system trust store is used, which a cluster CA will not be in, so verification fails. Turn this off only for testing."
                            ]}
                          </Paragraphs>
                        }
                      />
                    </Inline>
                  )}
                />
                {verifyTlsCertificate && (
                  <Controller
                    control={control}
                    name="caCertificate"
                    render={({ field, fieldState: { error } }) => (
                      <HintField
                        label="CA certificate"
                        optional
                        error={error?.message}
                        hint="The PEM-encoded CA certificate that issued the Kubernetes API server's TLS certificate. Needed whenever the server uses a certificate the system trust store does not recognise, which is the usual case for a cluster CA."
                      >
                        <Textarea
                          {...field}
                          mono
                          rows={3}
                          disabled={locked}
                          placeholder="-----BEGIN CERTIFICATE----- ..."
                        />
                      </HintField>
                    )}
                  />
                )}
                <Controller
                  control={control}
                  name="tokenReviewerJwt"
                  render={({ field, fieldState: { error } }) => (
                    <HintField
                      label="Token reviewer JWT"
                      optional
                      error={error?.message}
                      hint="Optional JWT token for accessing the Kubernetes TokenReview API. If provided, this long-lived token is used to validate service account tokens during authentication. If omitted, the gateway's own JWT is used instead, which requires the gateway to have the system:auth-delegator ClusterRole binding. A stored token is never shown again, so Reset is the only way to replace or remove one. Resetting is also required to change the Kubernetes host, since a stored token is never sent to a different host."
                    >
                      {isTokenReviewerJwtConfigured ? (
                        <Inline gap={8} wrap={false}>
                          <Input value="Configured" disabled readOnly />
                          <Button
                            type="button"
                            variant="outline"
                            disabled={locked}
                            onClick={() =>
                              setValue("resetTokenReviewerJwt", true, { shouldDirty: true })
                            }
                          >
                            Reset
                          </Button>
                        </Inline>
                      ) : (
                        <Textarea
                          {...field}
                          mono
                          rows={2}
                          disabled={locked}
                          placeholder="eyJhbGciOiJSUzI1NiIs..."
                        />
                      )}
                    </HintField>
                  )}
                />
              </>
            )}
          </>
        )}

        {isDirty && (
          <Inline gap={8} justify="end">
            <Button type="button" variant="ghost" disabled={isSaving} onClick={() => reset()}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={isSaving} disabled={locked}>
              Update
            </Button>
          </Inline>
        )}
      </Stack>
    </form>
  );
};
