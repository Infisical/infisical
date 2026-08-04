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
import { useOrganization } from "@app/context";

import {
  NETWORKING_AUTH_METHOD_OPTIONS,
  NetworkingAuthMethod,
  NetworkingAuthMethodOption,
  NetworkingAuthMethodSingleValue
} from "./NetworkingAuthMethodLabel";

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
    verifyTlsCertificate: z.boolean()
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
      if (!data.kubernetesHost.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["kubernetesHost"],
          message: "Kubernetes host is required"
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
    return {
      method: "kubernetes" as const,
      kubernetesHost: form.kubernetesHost,
      caCertificate: form.caCertificate,
      // Write-only, so a blank field means "leave the stored value alone".
      tokenReviewerJwt: form.tokenReviewerJwt.trim() ? form.tokenReviewerJwt : undefined,
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
  onUpdate: (authMethod: FormData) => Promise<boolean>;
};

export const NetworkingAuthMethodForm = ({
  currentMethod,
  isDisabled = false,
  isPending,
  availableMethods = ["token", "aws"],
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
    verifyTlsCertificate: initialKubernetes?.verifyTlsCertificate ?? true
  };

  const {
    control,
    handleSubmit,
    watch,
    reset,
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
    reset
  ]);

  const method = watch("method");
  const isSaving = isSubmitting || isPending;

  const submit = async (form: FormData) => {
    if (await onUpdate(form)) {
      reset(form);
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
                          The host string, host:port pair, or URL to the base of the Kubernetes API
                          server. This can usually be obtained by running &apos;kubectl
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
          <Controller
            control={control}
            name="caCertificate"
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel htmlFor="k8s-ca-cert" className="inline-flex items-center gap-1.5">
                  CA Certificate (optional)
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <InfoIcon className="size-3.5 text-muted" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-md">
                      The PEM-encoded CA certificate that issued the Kubernetes API server&apos;s
                      TLS certificate. Needed whenever the server uses a certificate the system
                      trust store does not recognise, which is the usual case for a cluster CA.
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
                      Optional JWT token for accessing Kubernetes TokenReview API. If provided, this
                      long-lived token will be used to validate service account tokens during
                      authentication. If omitted, the gateway&apos;s own JWT will be used instead,
                      which requires the gateway to have the system:auth-delegator ClusterRole
                      binding.
                    </TooltipContent>
                  </Tooltip>
                </FieldLabel>
                <FieldContent>
                  <TextArea
                    {...field}
                    id="k8s-token-reviewer"
                    disabled={isDisabled || isSaving}
                    isError={Boolean(error)}
                    rows={2}
                    className="font-mono text-xs"
                    placeholder={
                      initialKubernetes?.hasTokenReviewerJwt
                        ? "A reviewer token is configured. Paste a new one to replace it."
                        : "eyJhbGciOiJSUzI1NiIs..."
                    }
                  />
                  <FieldError errors={[error]} />
                </FieldContent>
              </Field>
            )}
          />
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
                            When enabled, Infisical validates the Kubernetes API server&apos;s TLS
                            certificate against the CA certificate provided above.
                          </p>
                          <p>
                            This only takes effect while a CA certificate is configured. Without one
                            there is nothing to verify against, so the API server&apos;s identity is
                            not checked even when this is enabled. The connection is still over
                            HTTPS.
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
