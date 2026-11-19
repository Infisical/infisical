import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";

import {
  Combobox,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input
} from "@app/components/v3";
import { getCaIssuanceCapabilities } from "@app/hooks/api/ca";
import { CaType } from "@app/hooks/api/ca/enums";

import { AdcsTemplateField } from "../../../components/AdcsTemplateField";
import { DigiCertExistingOrderField } from "../../../components/DigiCertExistingOrderField";
import { CertificateForm } from "./schemas";
import { CaOption } from "./types";

type CertificateStepProps = {
  form: ReturnType<typeof useForm<CertificateForm>>;
  caOptions: CaOption[];
  isCasLoading: boolean;
};

export const CertificateStep = ({ form, caOptions, isCasLoading }: CertificateStepProps) => {
  const selectedCaId = form.watch("caId");
  const selectedCa = caOptions.find((o) => o.id === selectedCaId) ?? null;
  const caps = getCaIssuanceCapabilities(selectedCa?.caType);

  const digicertCfg = selectedCa?.digicert;
  const canReuseOrder = caps.supportsExistingOrderReuse && Boolean(digicertCfg);
  const externalOrderId = form.watch("externalOrderId");
  const hasExternalOrder = Boolean(externalOrderId);

  const isAdcs = selectedCa?.caType === CaType.ADCS;
  const adcsConnectionId = selectedCa?.adcs?.appConnectionId;

  useEffect(() => {
    if (!canReuseOrder && externalOrderId) {
      form.setValue("externalOrderId", null);
    }
  }, [canReuseOrder, externalOrderId, form]);

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
              <Combobox<CaOption>
                isClearable={false}
                isLoading={isCasLoading}
                options={caOptions}
                value={caOptions.find((o) => o.id === field.value) ?? null}
                onValueChange={(opt) => field.onChange(opt.id)}
                getOptionLabel={(opt) => opt.name}
                getOptionValue={(opt) => opt.id}
                getOptionGroup={(opt) =>
                  opt.groupType === "internal" ? "Internal CAs" : "External CAs"
                }
                placeholder="Select a Certificate Authority..."
                searchPlaceholder="Search Certificate Authorities..."
                searchAriaLabel="Search Certificate Authorities"
                emptyMessage="No active CAs available."
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

      {isAdcs && (
        <AdcsTemplateField
          control={form.control}
          name="adcsTemplate"
          connectionId={adcsConnectionId}
          description="Select a code-signing template published on your CA. Changing it reissues the certificate."
        />
      )}

      {canReuseOrder && digicertCfg && (
        <DigiCertExistingOrderField form={form} digicert={digicertCfg} />
      )}

      {!hasExternalOrder && (
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
                  The legal name on the certificate. Changing it reissues the certificate.
                </FieldDescription>
                <FieldError errors={[error]} />
              </FieldContent>
            </Field>
          )}
        />
      )}

      {!hasExternalOrder && (
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
                  onChange={(e) => {
                    const val = e.target.value;
                    field.onChange(val === "" ? "" : Number(val));
                  }}
                  placeholder="365"
                  isError={Boolean(error)}
                />
                <FieldDescription>
                  How long each certificate stays valid. Changing it reissues the certificate.
                </FieldDescription>
                <FieldError errors={[error]} />
              </FieldContent>
            </Field>
          )}
        />
      )}

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
                Renew this many days before the certificate expires.
              </FieldDescription>
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
    </FieldGroup>
  );
};
