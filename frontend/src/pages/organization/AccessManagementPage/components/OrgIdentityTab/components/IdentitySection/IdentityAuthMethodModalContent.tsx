import { type ReactNode, useCallback } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  components as ReactSelectComponents,
  type OptionProps,
  type SingleValueProps
} from "react-select";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  BadgeCheckIcon,
  BracesIcon,
  CheckIcon,
  FileKeyIcon,
  KeyIcon,
  KeyRoundIcon,
  NetworkIcon
} from "lucide-react";
import { z } from "zod";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import {
  Badge,
  Field,
  FieldError,
  FieldLabel,
  FilterableSelect,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { MAX_IDENTITY_ACCESS_TOKEN_TTL_FALLBACK } from "@app/helpers/identityAuthSchemas";
import { IdentityAuthMethod } from "@app/hooks/api/identities";
import { useFetchServerStatus } from "@app/hooks/api/serverDetails";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { IdentityAliCloudAuthForm } from "./IdentityAliCloudAuthForm";
import { IdentityAwsAuthForm } from "./IdentityAwsAuthForm";
import { IdentityAzureAuthForm } from "./IdentityAzureAuthForm";
import { IdentityGcpAuthForm } from "./IdentityGcpAuthForm";
import { IdentityJwtAuthForm } from "./IdentityJwtAuthForm";
import { IdentityKubernetesAuthForm } from "./IdentityKubernetesAuthForm";
import { IdentityLdapAuthForm } from "./IdentityLdapAuthForm";
import { IdentityOciAuthForm } from "./IdentityOciAuthForm";
import { IdentityOidcAuthForm } from "./IdentityOidcAuthForm";
import { IdentitySpiffeAuthForm } from "./IdentitySpiffeAuthForm";
import { IdentityTlsCertAuthForm } from "./IdentityTlsCertAuthForm";
import { IdentityTokenAuthForm } from "./IdentityTokenAuthForm";
import { IdentityUniversalAuthForm } from "./IdentityUniversalAuthForm";

type Props = {
  popUp: UsePopUpState<["identityAuthMethod", "upgradePlan"]>;
  handlePopUpOpen: (popUpName: keyof UsePopUpState<["upgradePlan"]>) => void;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["identityAuthMethod", "upgradePlan"]>,
    state?: boolean
  ) => void;

  identity: {
    name: string;
    id: string;
    authMethods: IdentityAuthMethod[];
  };
  initialAuthMethod: IdentityAuthMethod;
  setSelectedAuthMethod: (authMethod: IdentityAuthMethod) => void;
  isUpdate: boolean;
  onSubmittingChange: (isSubmitting: boolean) => void;
};

type TRevokeMethods = {
  render: () => JSX.Element;
};

type TIdentityAuthMethodOption = {
  icon: ReactNode;
  label: string;
  value: IdentityAuthMethod;
};

type TIdentityAuthMethodSelectOption = TIdentityAuthMethodOption & {
  isConfigured: boolean;
  showConfiguredBadge: boolean;
};

const getProviderIcon = (fileName: string) => (
  <img
    src={`/images/integrations/${fileName}`}
    alt=""
    aria-hidden
    className="size-4 object-contain"
  />
);

const commonIdentityAuthMethods: TIdentityAuthMethodOption[] = [
  {
    icon: <KeyRoundIcon className="size-4 text-accent" />,
    label: "Universal Auth",
    value: IdentityAuthMethod.UNIVERSAL_AUTH
  },
  {
    icon: <KeyIcon className="size-4 text-accent" />,
    label: "Token Auth",
    value: IdentityAuthMethod.TOKEN_AUTH
  }
];

const otherIdentityAuthMethods: TIdentityAuthMethodOption[] = [
  {
    icon: getProviderIcon("Kubernetes.png"),
    label: "Kubernetes Auth",
    value: IdentityAuthMethod.KUBERNETES_AUTH
  },
  {
    icon: getProviderIcon("Google Cloud Platform.png"),
    label: "GCP Auth",
    value: IdentityAuthMethod.GCP_AUTH
  },
  {
    icon: getProviderIcon("Alibaba Cloud.png"),
    label: "Alibaba Cloud Auth",
    value: IdentityAuthMethod.ALICLOUD_AUTH
  },
  {
    icon: getProviderIcon("Amazon Web Services.png"),
    label: "AWS Auth",
    value: IdentityAuthMethod.AWS_AUTH
  },
  {
    icon: getProviderIcon("Microsoft Azure.png"),
    label: "Azure Auth",
    value: IdentityAuthMethod.AZURE_AUTH
  },
  {
    icon: getProviderIcon("Oracle.png"),
    label: "OCI Auth",
    value: IdentityAuthMethod.OCI_AUTH
  },
  {
    icon: <BadgeCheckIcon className="size-4 text-accent" />,
    label: "OIDC Auth",
    value: IdentityAuthMethod.OIDC_AUTH
  },
  {
    icon: getProviderIcon("LDAP.png"),
    label: "LDAP Auth",
    value: IdentityAuthMethod.LDAP_AUTH
  },
  {
    icon: <FileKeyIcon className="size-4 text-accent" />,
    label: "TLS Certificate Auth",
    value: IdentityAuthMethod.TLS_CERT_AUTH
  },
  {
    icon: <BracesIcon className="size-4 text-accent" />,
    label: "JWT Auth",
    value: IdentityAuthMethod.JWT_AUTH
  },
  {
    icon: <NetworkIcon className="size-4 text-accent" />,
    label: "SPIFFE Auth",
    value: IdentityAuthMethod.SPIFFE_AUTH
  }
].sort((a, b) => a.label.localeCompare(b.label));

const identityAuthMethods = [...commonIdentityAuthMethods, ...otherIdentityAuthMethods];

const AuthMethodOption = (props: OptionProps<TIdentityAuthMethodSelectOption>) => {
  const { data, isDisabled, isSelected } = props;
  const option = (
    <ReactSelectComponents.Option {...props}>
      <div
        className={`flex items-center justify-between gap-2 ${
          isDisabled ? "cursor-not-allowed opacity-50" : ""
        }`}
      >
        <span className="flex min-w-0 items-center gap-2">
          {data.icon}
          <span className="truncate">{data.label}</span>
          {data.showConfiguredBadge && <Badge variant="info">Configured</Badge>}
        </span>
        {isSelected && <CheckIcon className="size-4 shrink-0" />}
      </div>
    </ReactSelectComponents.Option>
  );

  return isDisabled ? (
    <Tooltip>
      <TooltipTrigger asChild>{option}</TooltipTrigger>
      <TooltipContent side="right">Authentication method already configured</TooltipContent>
    </Tooltip>
  ) : (
    option
  );
};

const AuthMethodSingleValue = (props: SingleValueProps<TIdentityAuthMethodSelectOption>) => {
  const { data } = props;

  return (
    <ReactSelectComponents.SingleValue {...props}>
      <span className="flex min-w-0 items-center gap-2">
        {data.icon}
        <span className="truncate">{data.label}</span>
      </span>
    </ReactSelectComponents.SingleValue>
  );
};

const schema = z
  .object({
    authMethod: z.nativeEnum(IdentityAuthMethod)
  })
  .required();

export type FormData = z.infer<typeof schema>;

export const IdentityAuthMethodModalContent = ({
  popUp,
  handlePopUpOpen,
  handlePopUpToggle,
  identity,
  initialAuthMethod,
  setSelectedAuthMethod,
  isUpdate,
  onSubmittingChange
}: Props) => {
  const { control, watch } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: async () => {
      let authMethod = initialAuthMethod;

      if (!authMethod) {
        const firstAuthMethodNotConfiguredAuthMethod = identityAuthMethods.find(
          ({ value }) => !identity?.authMethods?.includes(value)
        );

        if (firstAuthMethodNotConfiguredAuthMethod) {
          authMethod = firstAuthMethodNotConfiguredAuthMethod.value;
        }
      }

      setSelectedAuthMethod(authMethod);
      return {
        authMethod
      };
    }
  });

  const watchedAuthMethod = watch("authMethod");

  const { data: serverStatus } = useFetchServerStatus();
  const maxAccessTokenTTL =
    serverStatus?.maxIdentityAccessTokenTTL ?? MAX_IDENTITY_ACCESS_TOKEN_TTL_FALLBACK;

  const identityAuthMethodData = {
    identityId: identity.id,
    name: identity.name,
    authMethod: watch("authMethod"),
    configuredAuthMethods: identity.authMethods
  } as {
    identityId: string;
    name: string;
    authMethod?: IdentityAuthMethod;
    configuredAuthMethods?: IdentityAuthMethod[];
  };

  const isSelectedAuthAlreadyConfigured =
    identityAuthMethodData?.configuredAuthMethods?.includes(watchedAuthMethod);

  const methodMap: Record<IdentityAuthMethod, TRevokeMethods | undefined> = {
    [IdentityAuthMethod.UNIVERSAL_AUTH]: {
      render: () => (
        <IdentityUniversalAuthForm
          identityId={identityAuthMethodData.identityId}
          handlePopUpOpen={handlePopUpOpen}
          handlePopUpToggle={handlePopUpToggle}
          maxAccessTokenTTL={maxAccessTokenTTL}
          isUpdate={isUpdate}
          onSubmittingChange={onSubmittingChange}
        />
      )
    },
    [IdentityAuthMethod.TLS_CERT_AUTH]: {
      render: () => (
        <IdentityTlsCertAuthForm
          identityId={identityAuthMethodData.identityId}
          handlePopUpOpen={handlePopUpOpen}
          handlePopUpToggle={handlePopUpToggle}
          maxAccessTokenTTL={maxAccessTokenTTL}
          isUpdate={isUpdate}
          onSubmittingChange={onSubmittingChange}
        />
      )
    },

    [IdentityAuthMethod.OIDC_AUTH]: {
      render: () => (
        <IdentityOidcAuthForm
          identityId={identityAuthMethodData.identityId}
          handlePopUpOpen={handlePopUpOpen}
          handlePopUpToggle={handlePopUpToggle}
          maxAccessTokenTTL={maxAccessTokenTTL}
          isUpdate={isUpdate}
          onSubmittingChange={onSubmittingChange}
        />
      )
    },

    [IdentityAuthMethod.TOKEN_AUTH]: {
      render: () => (
        <IdentityTokenAuthForm
          identityId={identityAuthMethodData.identityId}
          handlePopUpOpen={handlePopUpOpen}
          handlePopUpToggle={handlePopUpToggle}
          maxAccessTokenTTL={maxAccessTokenTTL}
          isUpdate={isUpdate}
          onSubmittingChange={onSubmittingChange}
        />
      )
    },

    [IdentityAuthMethod.AZURE_AUTH]: {
      render: () => (
        <IdentityAzureAuthForm
          identityId={identityAuthMethodData.identityId}
          handlePopUpOpen={handlePopUpOpen}
          handlePopUpToggle={handlePopUpToggle}
          maxAccessTokenTTL={maxAccessTokenTTL}
          isUpdate={isUpdate}
          onSubmittingChange={onSubmittingChange}
        />
      )
    },

    [IdentityAuthMethod.GCP_AUTH]: {
      render: () => (
        <IdentityGcpAuthForm
          identityId={identityAuthMethodData.identityId}
          handlePopUpOpen={handlePopUpOpen}
          handlePopUpToggle={handlePopUpToggle}
          maxAccessTokenTTL={maxAccessTokenTTL}
          isUpdate={isUpdate}
          onSubmittingChange={onSubmittingChange}
        />
      )
    },

    [IdentityAuthMethod.KUBERNETES_AUTH]: {
      render: () => (
        <IdentityKubernetesAuthForm
          identityId={identityAuthMethodData.identityId}
          handlePopUpOpen={handlePopUpOpen}
          handlePopUpToggle={handlePopUpToggle}
          maxAccessTokenTTL={maxAccessTokenTTL}
          isUpdate={isUpdate}
          onSubmittingChange={onSubmittingChange}
        />
      )
    },

    [IdentityAuthMethod.ALICLOUD_AUTH]: {
      render: () => (
        <IdentityAliCloudAuthForm
          identityId={identityAuthMethodData.identityId}
          handlePopUpOpen={handlePopUpOpen}
          handlePopUpToggle={handlePopUpToggle}
          maxAccessTokenTTL={maxAccessTokenTTL}
          isUpdate={isUpdate}
          onSubmittingChange={onSubmittingChange}
        />
      )
    },

    [IdentityAuthMethod.AWS_AUTH]: {
      render: () => (
        <IdentityAwsAuthForm
          identityId={identityAuthMethodData.identityId}
          handlePopUpOpen={handlePopUpOpen}
          handlePopUpToggle={handlePopUpToggle}
          maxAccessTokenTTL={maxAccessTokenTTL}
          isUpdate={isUpdate}
          onSubmittingChange={onSubmittingChange}
        />
      )
    },

    [IdentityAuthMethod.OCI_AUTH]: {
      render: () => (
        <IdentityOciAuthForm
          identityId={identityAuthMethodData.identityId}
          handlePopUpOpen={handlePopUpOpen}
          handlePopUpToggle={handlePopUpToggle}
          maxAccessTokenTTL={maxAccessTokenTTL}
          isUpdate={isUpdate}
          onSubmittingChange={onSubmittingChange}
        />
      )
    },

    [IdentityAuthMethod.JWT_AUTH]: {
      render: () => (
        <IdentityJwtAuthForm
          identityId={identityAuthMethodData.identityId}
          handlePopUpOpen={handlePopUpOpen}
          handlePopUpToggle={handlePopUpToggle}
          maxAccessTokenTTL={maxAccessTokenTTL}
          isUpdate={isUpdate}
          onSubmittingChange={onSubmittingChange}
        />
      )
    },

    [IdentityAuthMethod.LDAP_AUTH]: {
      render: () => (
        <IdentityLdapAuthForm
          identityId={identityAuthMethodData.identityId}
          handlePopUpOpen={handlePopUpOpen}
          handlePopUpToggle={handlePopUpToggle}
          maxAccessTokenTTL={maxAccessTokenTTL}
          isUpdate={isUpdate}
          onSubmittingChange={onSubmittingChange}
        />
      )
    },

    [IdentityAuthMethod.SPIFFE_AUTH]: {
      render: () => (
        <IdentitySpiffeAuthForm
          identityId={identityAuthMethodData.identityId}
          handlePopUpOpen={handlePopUpOpen}
          handlePopUpToggle={handlePopUpToggle}
          maxAccessTokenTTL={maxAccessTokenTTL}
          isUpdate={isUpdate}
          onSubmittingChange={onSubmittingChange}
        />
      )
    }
  };

  const isAlreadyConfigured = useCallback((method: IdentityAuthMethod) => {
    return identityAuthMethodData?.configuredAuthMethods?.includes(method);
  }, []);

  const selectedMethodItem = methodMap[identityAuthMethodData.authMethod!];

  return (
    <>
      <Controller
        control={control}
        name="authMethod"
        defaultValue={IdentityAuthMethod.UNIVERSAL_AUTH}
        render={({ field: { onChange, value }, fieldState: { error } }) => {
          const authMethodOptions = identityAuthMethods.map((authMethod) => {
            const isConfigured = Boolean(isAlreadyConfigured(authMethod.value));

            return {
              ...authMethod,
              isConfigured,
              showConfiguredBadge: isConfigured && !isSelectedAuthAlreadyConfigured
            };
          });
          const selectedAuthMethod = authMethodOptions.find(
            ({ value: methodValue }) => methodValue === value
          );

          return (
            <Field className="mb-2">
              <FieldLabel htmlFor="auth-method">Auth Method</FieldLabel>
              <FilterableSelect<TIdentityAuthMethodSelectOption>
                inputId="auth-method"
                value={selectedAuthMethod}
                options={authMethodOptions}
                isDisabled={isSelectedAuthAlreadyConfigured}
                isError={Boolean(error)}
                isOptionDisabled={({ isConfigured }) => isConfigured}
                getOptionLabel={({ label }) => label}
                getOptionValue={({ value: methodValue }) => methodValue}
                components={{
                  Option: AuthMethodOption,
                  SingleValue: AuthMethodSingleValue
                }}
                placeholder="Select auth method"
                onChange={(next) => {
                  const nextAuthMethod = next as TIdentityAuthMethodSelectOption | null;

                  if (nextAuthMethod && !nextAuthMethod.isConfigured) {
                    setSelectedAuthMethod(nextAuthMethod.value);
                    onChange(nextAuthMethod.value);
                  }
                }}
              />
              <FieldError>{error?.message}</FieldError>
            </Field>
          );
        }}
      />
      {selectedMethodItem?.render ? selectedMethodItem.render() : <div />}
      <UpgradePlanModal
        isOpen={popUp?.upgradePlan?.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text={`Your current plan does not include access to ${popUp.upgradePlan.data?.featureName}. To unlock this feature, please upgrade to Infisical ${popUp.upgradePlan.data?.isEnterpriseFeature ? "Enterprise" : "Pro"} plan.`}
        isEnterpriseFeature={popUp.upgradePlan.data?.isEnterpriseFeature}
      />
    </>
  );
};
