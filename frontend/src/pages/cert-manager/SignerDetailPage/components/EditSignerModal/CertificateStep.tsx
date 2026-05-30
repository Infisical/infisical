import { Controller, useForm } from "react-hook-form";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FilterableSelect,
  Input
} from "@app/components/v3";

import { CertificateForm } from "./schemas";
import { CaGroup, CaOption } from "./types";

type CertificateStepProps = {
  form: ReturnType<typeof useForm<CertificateForm>>;
  caOptions: CaOption[];
  isCasLoading: boolean;
  commonName: string;
  certificateTtlDays: number | null;
  keyAlgorithmLabel: string;
  caSwap: boolean;
  canEditSubject: boolean;
};

export const CertificateStep = ({
  form,
  caOptions,
  isCasLoading,
  commonName,
  certificateTtlDays,
  keyAlgorithmLabel,
  caSwap,
  canEditSubject
}: CertificateStepProps) => (
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
              noOptionsMessage={() => "No active CAs found in this project."}
              isError={Boolean(error)}
            />
            <FieldDescription>
              Changing the CA reissues the certificate immediately.
            </FieldDescription>
            <FieldError errors={[error]} />
          </FieldContent>
        </Field>
      )}
    />

    {canEditSubject ? (
      <Controller
        name="commonName"
        control={form.control}
        render={({ field, fieldState: { error } }) => (
          <Field>
            <FieldLabel>
              Common Name <span className="text-danger">*</span>
            </FieldLabel>
            <FieldContent>
              <Input
                {...field}
                value={field.value ?? ""}
                placeholder="Acme Mobile, Inc."
                isError={Boolean(error)}
              />
              <FieldDescription>
                The legal name shown on the certificate. Editable while no certificate has been
                issued. Locked once the signer becomes Active.
              </FieldDescription>
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
    ) : (
      <Field>
        <FieldLabel>Common Name</FieldLabel>
        <FieldContent>
          <Input value={commonName} readOnly disabled />
          <FieldDescription>The legal name shown on the certificate.</FieldDescription>
        </FieldContent>
      </Field>
    )}

    {canEditSubject ? (
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
              <FieldDescription>
                How long each issued certificate stays valid. Locked once the signer becomes Active.
              </FieldDescription>
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
    ) : (
      <Field>
        <FieldLabel>Validity (days)</FieldLabel>
        <FieldContent>
          <Input
            value={certificateTtlDays != null ? String(certificateTtlDays) : "—"}
            readOnly
            disabled
          />
          <FieldDescription>How long each issued certificate stays valid.</FieldDescription>
        </FieldContent>
      </Field>
    )}

    <Field>
      <FieldLabel>Key algorithm</FieldLabel>
      <FieldContent>
        <Input value={keyAlgorithmLabel} readOnly disabled />
      </FieldContent>
    </Field>

    <Controller
      name="renewBeforeDays"
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

    {caSwap && (
      <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
        Saving will issue a new certificate from the selected CA right away.
      </div>
    )}
  </FieldGroup>
);
