import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { Link, useParams } from "@tanstack/react-router";
import { InfoIcon } from "lucide-react";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FilterableSelect,
  Input,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { useDigiCertConnectionListOrders } from "@app/hooks/api/appConnections/digicert";
import { getCaIssuanceCapabilities } from "@app/hooks/api/ca";

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

  const selectedCaId = form.watch("caId");
  const selectedCa = caOptions.find((o) => o.id === selectedCaId) ?? null;
  const caps = getCaIssuanceCapabilities(selectedCa?.caType);

  const digicertCfg = selectedCa?.digicert;
  const canReuseOrder = caps.supportsExistingOrderReuse && Boolean(digicertCfg);
  const { data: codeSigningOrders = [], isLoading: isOrdersLoading } =
    useDigiCertConnectionListOrders(
      digicertCfg?.appConnectionId ?? "",
      digicertCfg?.organizationId ?? 0,
      digicertCfg?.productNameId ?? "",
      { enabled: canReuseOrder }
    );

  const orderOptions = codeSigningOrders.map((o) => ({
    value: String(o.orderId),
    label: `${o.commonName || o.organizationName || "Code signing certificate"} (#${o.orderId})`,
    commonName: o.commonName
  }));
  type OrderOption = (typeof orderOptions)[number];

  const reissueOrderId = form.watch("reissueFromExternalOrderId");
  const isReissue = Boolean(reissueOrderId);

  useEffect(() => {
    if (!canReuseOrder && reissueOrderId) {
      form.setValue("reissueFromExternalOrderId", null);
    }
  }, [canReuseOrder, reissueOrderId, form]);

  useEffect(() => {
    if (
      canReuseOrder &&
      !isOrdersLoading &&
      reissueOrderId &&
      !codeSigningOrders.some((order) => String(order.orderId) === reissueOrderId)
    ) {
      form.setValue("reissueFromExternalOrderId", null);
    }
  }, [canReuseOrder, isOrdersLoading, reissueOrderId, codeSigningOrders, form]);

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
                The CA that issues the certificate.
                {!isCasLoading && caOptions.length === 0 && orgId && projectId && (
                  <>
                    {" "}
                    <Link
                      to={ROUTE_PATHS.CertManager.CertificateAuthoritiesPage.path}
                      params={{ orgId, projectId }}
                      className="text-primary underline hover:text-primary/80"
                    >
                      Create one first.
                    </Link>
                  </>
                )}
              </FieldDescription>
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />

      {canReuseOrder && (
        <Controller
          name="reissueFromExternalOrderId"
          control={form.control}
          render={({ field }) => (
            <Field>
              <FieldLabel>
                <span className="inline-flex items-center gap-1.5">
                  Reuse an existing order (optional)
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <InfoIcon className="h-3.5 w-3.5 text-muted" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      Issue into an existing order instead of creating a new one. The name and
                      validity are inherited from that order.
                    </TooltipContent>
                  </Tooltip>
                </span>
              </FieldLabel>
              <FieldContent>
                <FilterableSelect<OrderOption>
                  isLoading={isOrdersLoading}
                  isClearable
                  options={orderOptions}
                  value={orderOptions.find((o) => o.value === field.value) ?? null}
                  onChange={(selected) => {
                    const opt = selected as OrderOption | null;
                    field.onChange(opt?.value ?? null);
                    form.setValue(
                      "commonName",
                      opt ? opt.commonName || "Code signing certificate" : ""
                    );
                  }}
                  getOptionLabel={(opt) => opt.label}
                  getOptionValue={(opt) => opt.value}
                  placeholder="Issue a new certificate"
                  noOptionsMessage={() => "No existing orders found."}
                />
                <FieldDescription>Leave empty to issue a new certificate.</FieldDescription>
                {field.value && (
                  <FieldDescription className="text-warning">
                    Reissuing replaces the certificate in this order. DigiCert revokes the previous
                    one within 72 hours, after which it can no longer be used to sign.
                  </FieldDescription>
                )}
              </FieldContent>
            </Field>
          )}
        />
      )}

      {!isReissue && (
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
      )}

      {!isReissue && (
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
