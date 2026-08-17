import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { HelpCircleIcon, InfoIcon } from "lucide-react";
import { z } from "zod";

import {
  Button,
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  FilterableSelect,
  Input,
  Switch,
  TextArea,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { GatewayPicker } from "@app/components/v3/platform/GatewayPicker/GatewayPicker";
import { useOrganization } from "@app/context";

import {
  NETWORKING_AUTH_METHOD_OPTIONS,
  NetworkingAuthMethod,
  NetworkingAuthMethodOption,
  NetworkingAuthMethodSingleValue
} from "./NetworkingAuthMethodLabel";

const REVIEW_MODE_OPTIONS = [
  { value: "gateway" as const, label: "Gateway as Reviewer" },
  { value: "api" as const, label: "Manual Token Reviewer JWT (API)" }
];

const schema = z
  .object({
    method: z.enum(["aws", "kubernetes", "token"]),
    stsEndpoint: z.string(),
    allowedPrincipalArns: z.string(),
    allowedAccountIds: z.string(),
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
    // Empty string means "no proxy": review straight from Infisical. Only one may be set.
    gatewayId: z.string(),
    gatewayPoolId: z.string(),
    // True once Reset is clicked, which swaps the stored token for an editable field. Saving with
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
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["allowedPrincipalArns"],
        message
      });
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["allowedAccountIds"],
        message
      });
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
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["allowedNamespaces"],
          message
        });
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["allowedNames"],
          message
        });
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
      stsEndpoint: form.stsEndpoint,
      allowedPrincipalArns: form.allowedPrincipalArns,
      allowedAccountIds: form.allowedAccountIds
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

type AuthMethod =
  | {
      method: "aws";
      config: {
        stsEndpoint: string;
        allowedPrincipalArns: string;
        allowedAccountIds: string;
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
  | {
      method: "token";
      config?: unknown;
    };

type Props = {
  currentMethod: AuthMethod;
  isDisabled?: boolean;
  isPending: boolean;
  // Kubernetes auth is gateway-only, since only gateways run inside the cluster.
  availableMethods?: NetworkingAuthMethod[];
  // Excluded from the proxy picker: a gateway cannot review its own token.
  currentGatewayId?: string;
  onUpdate: (authMethod: FormData) => Promise<boolean>;
};

export const NetworkingAuthMethodForm = ({
  currentMethod,
  isDisabled = false,
  isPending,
  availableMethods = ["token", "aws"],
  currentGatewayId,
  onUpdate
}: Props) => {
  const { isSubOrganization } = useOrganization();
  const initialMethod: NetworkingAuthMethod = currentMethod.method;
  const initialAws = currentMethod.method === "aws" ? currentMethod.config : undefined;
  const initialKubernetes =
    currentMethod.method === "kubernetes" ? currentMethod.config : undefined;
  const methodOptions = NETWORKING_AUTH_METHOD_OPTIONS.filter(({ value }) =>
    availableMethods.includes(value)
  );
  const defaultValues: FormData = {
    method: initialMethod,
    stsEndpoint: initialAws?.stsEndpoint ?? "https://sts.amazonaws.com/",
    allowedPrincipalArns: initialAws?.allowedPrincipalArns ?? "",
    allowedAccountIds: initialAws?.allowedAccountIds ?? "",
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
    formState: { isSubmitting, isDirty }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues
  });

  useEffect(() => {
    reset(defaultValues);
    // The individual method values below are the server-backed reset boundary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentMethod.method,
    initialAws?.stsEndpoint,
    initialAws?.allowedPrincipalArns,
    initialAws?.allowedAccountIds,
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
  const verifyTlsCertificate = watch("verifyTlsCertificate");
  const tokenReviewMode = watch("tokenReviewMode");
  const gatewayId = watch("gatewayId");
  const gatewayPoolId = watch("gatewayPoolId");
  const isProxied = Boolean(gatewayId || gatewayPoolId);
  const isGatewayReviewer = tokenReviewMode === "gateway";
  const isTokenReviewerJwtConfigured =
    Boolean(initialKubernetes?.hasTokenReviewerJwt) && !watch("resetTokenReviewerJwt");

  const submit = async (form: FormData) => {
    if (await onUpdate(form)) {
      // Drop the reviewer token from form state so a saved one collapses back to "Configured"
      // instead of leaving the value on screen.
      reset({ ...form, tokenReviewerJwt: "", resetTokenReviewerJwt: false });
    }
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-3">
      <Controller
        control={control}
        name="method"
        render={({ field }) => {
          const selected =
            methodOptions.find((option) => option.value === field.value) ?? methodOptions[0];

          return (
            <FilterableSelect
              value={selected}
              onChange={(option) => {
                const next = option as { value: NetworkingAuthMethod } | null;
                if (next) field.onChange(next.value);
              }}
              options={methodOptions}
              isSearchable={false}
              isClearable={false}
              isDisabled={isDisabled || isSaving}
              getOptionLabel={(option) => option.label}
              getOptionValue={(option) => option.value}
              components={{
                Option: NetworkingAuthMethodOption,
                SingleValue: NetworkingAuthMethodSingleValue
              }}
            />
          );
        }}
      />

      {method === "aws" && (
        <>
          <Controller
            control={control}
            name="allowedPrincipalArns"
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel>Allowed Principal ARNs</FieldLabel>
                <FieldContent>
                  <Input
                    {...field}
                    disabled={isDisabled || isSaving}
                    isError={Boolean(error)}
                    placeholder="arn:aws:iam::123456789012:role/MyRoleName, ..."
                  />
                  <FieldError errors={[error]} />
                </FieldContent>
              </Field>
            )}
          />
          <Controller
            control={control}
            name="allowedAccountIds"
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel>Allowed Account IDs</FieldLabel>
                <FieldContent>
                  <Input
                    {...field}
                    disabled={isDisabled || isSaving}
                    isError={Boolean(error)}
                    placeholder="123456789012, ..."
                  />
                  <FieldError errors={[error]} />
                </FieldContent>
              </Field>
            )}
          />
          <Controller
            control={control}
            name="stsEndpoint"
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel>STS Endpoint</FieldLabel>
                <FieldContent>
                  <Input
                    {...field}
                    disabled={isDisabled || isSaving}
                    isError={Boolean(error)}
                    placeholder="https://sts.amazonaws.com/"
                  />
                  <FieldError errors={[error]} />
                </FieldContent>
              </Field>
            )}
          />
        </>
      )}

      {method === "kubernetes" && (
        <>
          <Controller
            control={control}
            name="gatewayId"
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel className="inline-flex items-center gap-1.5">
                  Gateway (optional)
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <InfoIcon className="size-3.5 text-muted" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-md">
                      Routes the TokenReview through an existing gateway, for clusters whose API
                      server Infisical cannot reach. It must be a different gateway that is already
                      enrolled and connected, since a gateway cannot vouch for itself.
                    </TooltipContent>
                  </Tooltip>
                </FieldLabel>
                <FieldContent>
                  <GatewayPicker
                    value={{ gatewayId: field.value || null, gatewayPoolId: gatewayPoolId || null }}
                    onChange={(next) => {
                      setValue("gatewayId", next.gatewayId ?? "", { shouldDirty: true });
                      setValue("gatewayPoolId", next.gatewayPoolId ?? "", { shouldDirty: true });
                      // Without a proxy there is nobody to hand the review to.
                      if (!next.gatewayId && !next.gatewayPoolId) {
                        setValue("tokenReviewMode", "api", { shouldDirty: true });
                      }
                    }}
                    isDisabled={isDisabled || isSaving}
                    isError={Boolean(error)}
                    excludeGatewayId={currentGatewayId}
                  />
                  <FieldError errors={[error]} />
                </FieldContent>
              </Field>
            )}
          />
          {isProxied && (
            <Controller
              control={control}
              name="tokenReviewMode"
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel className="inline-flex items-center gap-1.5">
                    Review Mode
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <InfoIcon className="size-3.5 text-muted" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-md">
                        Who performs the TokenReview. Gateway as Reviewer has the gateway do it with
                        its own service account, which needs no host or reviewer token but requires
                        that gateway to run as a pod in the cluster. Manual Token Reviewer JWT has
                        Infisical do it, tunnelling through the gateway to the host below.
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <FieldContent>
                    <FilterableSelect
                      value={REVIEW_MODE_OPTIONS.find((option) => option.value === field.value)}
                      onChange={(option) => {
                        const next = option as { value: "api" | "gateway" } | null;
                        if (next) field.onChange(next.value);
                      }}
                      options={REVIEW_MODE_OPTIONS}
                      isDisabled={isDisabled || isSaving}
                      isSearchable={false}
                      isClearable={false}
                      getOptionLabel={(option) => option.label}
                      getOptionValue={(option) => option.value}
                    />
                    <FieldError errors={[error]} />
                  </FieldContent>
                </Field>
              )}
            />
          )}
          {!isGatewayReviewer && (
            <Controller
              control={control}
              name="kubernetesHost"
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel htmlFor="k8s-host" className="inline-flex items-center gap-1.5">
                    Kubernetes Host / Base Kubernetes API URL
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <InfoIcon className="size-3.5 text-muted" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-md">
                        <div className="flex flex-col gap-1">
                          <p>
                            The host string, host:port pair, or URL to the base of the Kubernetes
                            API server. This can usually be obtained by running &apos;kubectl
                            cluster-info&apos;
                          </p>
                          <p>
                            Must be reachable from Infisical, which reviews the token on each login.
                          </p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <FieldContent>
                    <Input
                      {...field}
                      id="k8s-host"
                      autoComplete="off"
                      disabled={isDisabled || isSaving}
                      isError={Boolean(error)}
                      placeholder="https://my-example-k8s-api-host.com"
                    />
                    <FieldError errors={[error]} />
                  </FieldContent>
                </Field>
              )}
            />
          )}
          <Controller
            control={control}
            name="allowedNamespaces"
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel
                  htmlFor="k8s-allowed-namespaces"
                  className="inline-flex items-center gap-1.5"
                >
                  Allowed Namespaces
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <InfoIcon className="size-3.5 text-muted" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-md">
                      <div className="flex flex-col gap-1">
                        <p>
                          A comma-separated list of trusted namespaces that service accounts must
                          belong to authenticate as this gateway.
                        </p>
                        <p>
                          Wildcard patterns are supported. Use <span className="font-mono">*</span>{" "}
                          to explicitly allow all.
                        </p>
                        <p className="text-sm">
                          Examples: <span className="font-mono">dev-*</span>,{" "}
                          <span className="font-mono">staging-*</span>
                        </p>
                        <p>
                          At least one of allowed namespaces or service account names is required.
                        </p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </FieldLabel>
                <FieldContent>
                  <Input
                    {...field}
                    id="k8s-allowed-namespaces"
                    autoComplete="off"
                    disabled={isDisabled || isSaving}
                    isError={Boolean(error)}
                    placeholder="namespaceA, namespaceB, dev-*"
                  />
                  <FieldError errors={[error]} />
                </FieldContent>
              </Field>
            )}
          />
          <Controller
            control={control}
            name="allowedNames"
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel
                  htmlFor="k8s-allowed-names"
                  className="inline-flex items-center gap-1.5"
                >
                  Allowed Service Account Names
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <InfoIcon className="size-3.5 text-muted" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-md">
                      <div className="flex flex-col gap-1">
                        <p>
                          A comma-separated list of trusted service account names that are allowed
                          to authenticate as this gateway.
                        </p>
                        <p>
                          Wildcard patterns are supported. Use <span className="font-mono">*</span>{" "}
                          to explicitly allow all.
                        </p>
                        <p className="text-sm">
                          Examples: <span className="font-mono">dev-*</span>,{" "}
                          <span className="font-mono">app-*-prod</span>
                        </p>
                        <p>
                          At least one of allowed namespaces or service account names is required.
                        </p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </FieldLabel>
                <FieldContent>
                  <Input
                    {...field}
                    id="k8s-allowed-names"
                    autoComplete="off"
                    disabled={isDisabled || isSaving}
                    isError={Boolean(error)}
                    placeholder="service-account-1-name, sa-*, app-*-prod"
                  />
                  <FieldError errors={[error]} />
                </FieldContent>
              </Field>
            )}
          />
          <Controller
            control={control}
            name="allowedAudience"
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel
                  htmlFor="k8s-allowed-audience"
                  className="inline-flex items-center gap-1.5"
                >
                  Allowed Audience (optional)
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <InfoIcon className="size-3.5 text-muted" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-md">
                      An optional audience claim that the service account JWT token must have to
                      authenticate with Infisical. Leave empty to allow any audience claim.
                    </TooltipContent>
                  </Tooltip>
                </FieldLabel>
                <FieldContent>
                  <Input
                    {...field}
                    id="k8s-allowed-audience"
                    disabled={isDisabled || isSaving}
                    isError={Boolean(error)}
                    placeholder="https://kubernetes.default.svc"
                  />
                  <FieldError errors={[error]} />
                </FieldContent>
              </Field>
            )}
          />
          {!isGatewayReviewer && (
            <>
              <Controller
                control={control}
                name="verifyTlsCertificate"
                render={({ field, fieldState: { error } }) => (
                  <Field>
                    <div className="flex items-center gap-2">
                      <Switch
                        id="gateway-k8s-verify-tls"
                        variant="org"
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={isDisabled || isSaving}
                      />
                      <FieldLabel
                        htmlFor="gateway-k8s-verify-tls"
                        className="mb-0 inline-flex items-center gap-1.5"
                      >
                        Verify TLS Certificate
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircleIcon className="size-3.5 text-muted" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-md">
                            <div className="flex flex-col gap-2">
                              <p>
                                When enabled, Infisical validates the Kubernetes API server&apos;s
                                TLS certificate against the CA certificate below.
                              </p>
                              <p>
                                With a CA certificate below, the server is verified against it.
                                Without one the system trust store is used, which a cluster CA will
                                not be in, so verification fails. Turn this off only for testing.
                              </p>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </FieldLabel>
                    </div>
                    <FieldError errors={[error]} />
                  </Field>
                )}
              />
              {verifyTlsCertificate && (
                <Controller
                  control={control}
                  name="caCertificate"
                  render={({ field, fieldState: { error } }) => (
                    <Field>
                      <FieldLabel
                        htmlFor="k8s-ca-cert"
                        className="inline-flex items-center gap-1.5"
                      >
                        CA Certificate (optional)
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <InfoIcon className="size-3.5 text-muted" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-md">
                            The PEM-encoded CA certificate that issued the Kubernetes API
                            server&apos;s TLS certificate. Needed whenever the server uses a
                            certificate the system trust store does not recognise, which is the
                            usual case for a cluster CA.
                          </TooltipContent>
                        </Tooltip>
                      </FieldLabel>
                      <FieldContent>
                        <TextArea
                          {...field}
                          id="k8s-ca-cert"
                          disabled={isDisabled || isSaving}
                          isError={Boolean(error)}
                          rows={3}
                          className="font-mono text-xs"
                          placeholder="-----BEGIN CERTIFICATE----- ..."
                        />
                        <FieldError errors={[error]} />
                      </FieldContent>
                    </Field>
                  )}
                />
              )}
              <Controller
                control={control}
                name="tokenReviewerJwt"
                render={({ field, fieldState: { error } }) => (
                  <Field>
                    <FieldLabel
                      htmlFor="k8s-token-reviewer"
                      className="inline-flex items-center gap-1.5"
                    >
                      Token Reviewer JWT (optional)
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <InfoIcon className="size-3.5 text-muted" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-md">
                          Optional JWT token for accessing Kubernetes TokenReview API. If provided,
                          this long-lived token will be used to validate service account tokens
                          during authentication. If omitted, the gateway&apos;s own JWT will be used
                          instead, which requires the gateway to have the system:auth-delegator
                          ClusterRole binding. A stored token is never shown again, so Reset is the
                          only way to replace or remove one. Resetting is also required to change
                          the Kubernetes host, since a stored token is never sent to a different
                          host.
                        </TooltipContent>
                      </Tooltip>
                    </FieldLabel>
                    <FieldContent>
                      {isTokenReviewerJwtConfigured ? (
                        <div className="flex items-center gap-2">
                          <Input id="k8s-token-reviewer" value="Configured" disabled />
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            isDisabled={isDisabled || isSaving}
                            onClick={() =>
                              setValue("resetTokenReviewerJwt", true, { shouldDirty: true })
                            }
                          >
                            Reset
                          </Button>
                        </div>
                      ) : (
                        <TextArea
                          {...field}
                          id="k8s-token-reviewer"
                          disabled={isDisabled || isSaving}
                          isError={Boolean(error)}
                          rows={2}
                          className="font-mono text-xs"
                          placeholder="eyJhbGciOiJSUzI1NiIs..."
                        />
                      )}
                      <FieldError errors={[error]} />
                    </FieldContent>
                  </Field>
                )}
              />
            </>
          )}
        </>
      )}

      {isDirty && (
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            isDisabled={isSaving}
            onClick={() => reset()}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            size="sm"
            variant={isSubOrganization ? "sub-org" : "org"}
            isPending={isSaving}
            isDisabled={isDisabled || isSaving}
          >
            Update
          </Button>
        </div>
      )}
    </form>
  );
};
