import { Controller, useForm } from "react-hook-form";
import { Link, useParams } from "@tanstack/react-router";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FilterableSelect,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { SignerKeyAlgorithm, signerKeyAlgorithmLabels } from "@app/hooks/api/signers";

import { CertificateForm } from "./schemas";
import { CaGroup, CaOption } from "./types";

type CertificateStepProps = {
  form: ReturnType<typeof useForm<CertificateForm>>;
  caOptions: CaOption[];
  isCasLoading: boolean;
};

export const CertificateStep = ({ form, caOptions, isCasLoading }: CertificateStepProps) => {
  const { orgId, projectId } = useParams({ strict: false }) as {
    orgId?: string;
    projectId?: string;
  };
  return (
    <FieldGroup>
      <Controller
        name="caId"
        control={form.control}
        render={({ field, fieldState: { error } }) => (
          <Field>
            <FieldLabel>
              Certificate Authority <span className="text-danger">*</span>
            </FieldLabel>
            <FieldContent>
              <FilterableSelect<CaOption>
                isLoading={isCasLoading}
                options={caOptions}
                value={caOptions.find((o) => o.id === field.value) ?? null}
                onChange={(selected) => {
                  const opt = selected as CaOption | null;
                  field.onChange(opt?.id ?? "");
                }}
                getOptionLabel={(opt) => opt.name}
                getOptionValue={(opt) => opt.id}
                groupBy={caOptions.length > 0 ? "groupType" : undefined}
                getGroupHeaderLabel={
                  caOptions.length > 0
                    ? (groupType: CaGroup) =>
                        groupType === "internal" ? "Internal CAs" : "External CAs"
                    : undefined
                }
                placeholder="Select a Certificate Authority..."
                noOptionsMessage={() => "No active CAs available."}
                isError={Boolean(error)}
              />
              <FieldDescription>
                The CA that will issue the certificate.
                {!isCasLoading && caOptions.length === 0 && orgId && projectId && (
                  <>
                    {" "}
                    <Link
                      to={ROUTE_PATHS.CertManager.CertificateAuthoritiesPage.path}
                      params={{ orgId, projectId }}
                      className="text-primary underline hover:text-primary/80"
                    >
                      Create one in the Certificate Authorities page.
                    </Link>
                  </>
                )}
              </FieldDescription>
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
      <Controller
        name="commonName"
        control={form.control}
        render={({ field, fieldState: { error } }) => (
          <Field>
            <FieldLabel>
              Common Name <span className="text-danger">*</span>
            </FieldLabel>
            <FieldContent>
              <Input {...field} placeholder="Acme Mobile, Inc." isError={Boolean(error)} />
              <FieldDescription>The legal name shown on the certificate.</FieldDescription>
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
      <Controller
        name="keyAlgorithm"
        control={form.control}
        render={({ field, fieldState: { error } }) => (
          <Field>
            <FieldLabel>
              Key algorithm <span className="text-danger">*</span>
            </FieldLabel>
            <FieldContent>
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(SignerKeyAlgorithm).map((value) => (
                    <SelectItem key={value} value={value}>
                      {signerKeyAlgorithmLabels[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>
                Algorithm used to generate the signer&apos;s private key. RSA is widely compatible,
                ECDSA produces smaller signatures and is faster.
              </FieldDescription>
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
      <Controller
        name="certificateTtlDays"
        control={form.control}
        render={({ field, fieldState: { error } }) => (
          <Field>
            <FieldLabel>
              Validity (days) <span className="text-danger">*</span>
            </FieldLabel>
            <FieldContent>
              <Input
                type="number"
                min={1}
                max={3650}
                value={field.value ?? ""}
                onChange={(e) => field.onChange(Number(e.target.value))}
                placeholder="365"
                isError={Boolean(error)}
              />
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
      <Controller
        name="certificateRenewBeforeDays"
        control={form.control}
        render={({ field, fieldState: { error } }) => (
          <Field>
            <FieldLabel>Renew before (days)</FieldLabel>
            <FieldContent>
              <Input
                type="number"
                min={1}
                max={30}
                value={field.value ?? ""}
                onChange={(e) => {
                  const raw = e.target.value;
                  field.onChange(raw === "" ? null : Number(raw));
                }}
                placeholder="Leave empty to disable auto-renewal"
                isError={Boolean(error)}
              />
              <FieldDescription>
                Renew the certificate this many days before it expires.
              </FieldDescription>
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
    </FieldGroup>
  );
};
