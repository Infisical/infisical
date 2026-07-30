import { Control, Controller, UseFormSetValue } from "react-hook-form";
import { SingleValue } from "react-select";
import { Info } from "lucide-react";

import {
  Field,
  FieldError,
  FieldLabel,
  FilterableSelect,
  Input,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { TAvailableAppConnection } from "@app/hooks/api/appConnections";
import { TDigiCertOrganization, TDigiCertProduct } from "@app/hooks/api/appConnections/digicert";
import { DigiCertCaPurpose } from "@app/hooks/api/ca/types";

import { AppConnectionSelectField } from "./AppConnectionSelectField";
import { DigiCertProductType } from "./constants";
import { FormData } from "./schema";

const PURPOSE_OPTIONS = [
  { value: DigiCertCaPurpose.Ssl, label: "SSL / TLS" },
  { value: DigiCertCaPurpose.CodeSigning, label: "Code Signing" }
];

type Props = {
  control: Control<FormData>;
  setValue: UseFormSetValue<FormData>;
  configuration: FormData["configuration"] | undefined;
  availableConnections: TAvailableAppConnection[];
  isPending: boolean;
  digicertConnectionId: string;
  digicertOrganizations: TDigiCertOrganization[];
  isDigiCertOrgsPending: boolean;
  digicertProducts: TDigiCertProduct[];
  isDigiCertProductsPending: boolean;
  csRequiresContact: boolean;
};

export const DigiCertFields = ({
  control,
  setValue,
  configuration,
  availableConnections,
  isPending,
  digicertConnectionId,
  digicertOrganizations,
  isDigiCertOrgsPending,
  digicertProducts,
  isDigiCertProductsPending,
  csRequiresContact
}: Props) => (
  <>
    <AppConnectionSelectField
      control={control}
      name="configuration.digicertConnection"
      label="DigiCert Connection"
      required
      options={availableConnections}
      isLoading={isPending}
      tooltip="DigiCert App Connection provides the CertCentral API key used to place orders."
    />
    <Controller
      control={control}
      name="configuration.organizationId"
      render={({ field: { value }, fieldState: { error } }) => (
        <Field className="mb-4">
          <FieldLabel>
            Organization <span className="text-danger">*</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info />
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">
                The validated CertCentral organization that will appear on issued certificates.
              </TooltipContent>
            </Tooltip>
          </FieldLabel>
          <FilterableSelect
            isLoading={isDigiCertOrgsPending && !!digicertConnectionId}
            isDisabled={!digicertConnectionId}
            value={digicertOrganizations.find((org) => org.id === value) ?? null}
            onChange={(option) => {
              setValue(
                "configuration.organizationId",
                (option as SingleValue<TDigiCertOrganization>)?.id ?? 0
              );
            }}
            options={digicertOrganizations}
            placeholder="Select an organization..."
            getOptionLabel={(option) => option.displayName || option.name}
            getOptionValue={(option) => String(option.id)}
            isError={Boolean(error)}
          />
          <FieldError errors={[error]} />
        </Field>
      )}
    />
    <Controller
      control={control}
      name="configuration.purpose"
      render={({ field: { value, onChange }, fieldState: { error } }) => (
        <Field className="mb-4">
          <FieldLabel>
            Purpose <span className="text-danger">*</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info />
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">
                What this CA issues. Selecting Code Signing filters the Product list to
                DigiCert&apos;s code-signing products.
              </TooltipContent>
            </Tooltip>
          </FieldLabel>
          <FilterableSelect
            value={
              PURPOSE_OPTIONS.find((o) => o.value === (value ?? DigiCertCaPurpose.Ssl)) ??
              PURPOSE_OPTIONS[0]
            }
            onChange={(option) => {
              const next = (option as SingleValue<{ value: DigiCertCaPurpose; label: string }>)
                ?.value;
              if (next) {
                onChange(next);
                setValue("configuration.productNameId", "");
              }
            }}
            options={PURPOSE_OPTIONS}
            getOptionLabel={(option) => option.label}
            getOptionValue={(option) => option.value}
            isError={Boolean(error)}
          />
          <FieldError errors={[error]} />
        </Field>
      )}
    />
    <Controller
      control={control}
      name="configuration.productNameId"
      render={({ field: { value, onChange }, fieldState: { error } }) => {
        const purpose =
          configuration && "purpose" in configuration
            ? (configuration.purpose ?? DigiCertCaPurpose.Ssl)
            : DigiCertCaPurpose.Ssl;
        const filteredProducts = digicertProducts.filter((p) => {
          if (purpose === DigiCertCaPurpose.CodeSigning)
            return p.type === DigiCertProductType.CodeSigning;
          return p.type === DigiCertProductType.Ssl || !p.type;
        });
        return (
          <Field className="mb-4">
            <FieldLabel>
              Product <span className="text-danger">*</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info />
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">
                  Products available are account-specific entitlements fetched from CertCentral.
                  Each Infisical CA issues under exactly one product.
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            <FilterableSelect
              isLoading={isDigiCertProductsPending && !!digicertConnectionId}
              isDisabled={!digicertConnectionId}
              value={filteredProducts.find((product) => product.nameId === value) ?? null}
              onChange={(option) => {
                onChange((option as SingleValue<TDigiCertProduct>)?.nameId ?? "");
              }}
              options={filteredProducts}
              placeholder="Select a product..."
              getOptionLabel={(option) => `${option.name} (${option.nameId})`}
              getOptionValue={(option) => option.nameId}
              isError={Boolean(error)}
            />
            <FieldError errors={[error]} />
          </Field>
        );
      }}
    />
    {csRequiresContact && (
      <div className="mt-3 mb-2 rounded-md border border-border bg-mineshaft-800 p-4">
        <div className="mb-1 text-sm font-medium text-foreground">Verified Contact</div>
        <div className="mb-4 text-xs text-muted">
          This organization has not completed DigiCert code-signing validation yet, so a verified
          contact is required. DigiCert emails this person an approval link they must click to start
          organization validation.
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          <Controller
            control={control}
            name="configuration.verifiedContact.firstName"
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel>
                  First Name <span className="text-danger">*</span>
                </FieldLabel>
                <Input
                  {...field}
                  value={field.value ?? ""}
                  placeholder="John"
                  isError={Boolean(error)}
                />
                <FieldError errors={[error]} />
              </Field>
            )}
          />
          <Controller
            control={control}
            name="configuration.verifiedContact.lastName"
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel>
                  Last Name <span className="text-danger">*</span>
                </FieldLabel>
                <Input
                  {...field}
                  value={field.value ?? ""}
                  placeholder="Doe"
                  isError={Boolean(error)}
                />
                <FieldError errors={[error]} />
              </Field>
            )}
          />
          <Controller
            control={control}
            name="configuration.verifiedContact.email"
            render={({ field, fieldState: { error } }) => (
              <Field className="col-span-2">
                <FieldLabel>
                  Email <span className="text-danger">*</span>
                </FieldLabel>
                <Input
                  {...field}
                  value={field.value ?? ""}
                  placeholder="john.doe@example.com"
                  isError={Boolean(error)}
                />
                <FieldError errors={[error]} />
              </Field>
            )}
          />
          <Controller
            control={control}
            name="configuration.verifiedContact.jobTitle"
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel>
                  Job Title <span className="text-danger">*</span>
                </FieldLabel>
                <Input
                  {...field}
                  value={field.value ?? ""}
                  placeholder="Security Engineer"
                  isError={Boolean(error)}
                />
                <FieldError errors={[error]} />
              </Field>
            )}
          />
          <Controller
            control={control}
            name="configuration.verifiedContact.telephone"
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel>
                  Telephone <span className="text-danger">*</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-sm">
                      Include the country code, e.g. +15551234567.
                    </TooltipContent>
                  </Tooltip>
                </FieldLabel>
                <Input
                  {...field}
                  value={field.value ?? ""}
                  placeholder="+15551234567"
                  isError={Boolean(error)}
                />
                <FieldError errors={[error]} />
              </Field>
            )}
          />
        </div>
      </div>
    )}
  </>
);
