import { useEffect } from "react";
import { Controller, UseFormReturn } from "react-hook-form";
import { InfoIcon } from "lucide-react";

import {
  Combobox,
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useDigiCertConnectionListOrders } from "@app/hooks/api/appConnections/digicert";

export enum ExternalOrderMode {
  UseExisting = "use-existing",
  Reissue = "reissue"
}

export const isUsingExistingCertificate = (data: {
  externalOrderId?: string | null;
  externalOrderMode?: ExternalOrderMode;
}) => Boolean(data.externalOrderId) && data.externalOrderMode === ExternalOrderMode.UseExisting;

type DigiCertExistingOrderFieldProps = {
  form: UseFormReturn<any>;
  digicert: { appConnectionId: string; organizationId: number; productNameId: string };
};

export const DigiCertExistingOrderField = ({ form, digicert }: DigiCertExistingOrderFieldProps) => {
  const { data: codeSigningOrders = [], isLoading: isOrdersLoading } =
    useDigiCertConnectionListOrders(
      digicert.appConnectionId,
      digicert.organizationId,
      digicert.productNameId
    );

  const orderOptions = codeSigningOrders.map((o) => ({
    value: String(o.orderId),
    label: `${o.commonName || o.organizationName || "Code signing certificate"} (#${o.orderId})`,
    commonName: o.commonName
  }));
  type OrderOption = (typeof orderOptions)[number];

  const externalOrderId = form.watch("externalOrderId") as string | null;

  useEffect(() => {
    if (
      !isOrdersLoading &&
      externalOrderId &&
      !orderOptions.some((option) => option.value === externalOrderId)
    ) {
      form.setValue("externalOrderId", null);
    }
  }, [isOrdersLoading, externalOrderId, orderOptions, form]);

  return (
    <Controller
      name="externalOrderId"
      control={form.control}
      render={({ field }) => (
        <Field>
          <FieldLabel>
            <span className="inline-flex items-center gap-1.5">
              Existing order (optional)
              <Tooltip>
                <TooltipTrigger asChild>
                  <InfoIcon className="h-3.5 w-3.5 text-muted" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  Use an order you already have instead of creating a new one. The name and validity
                  come from that order.
                </TooltipContent>
              </Tooltip>
            </span>
          </FieldLabel>
          <FieldContent>
            <Combobox<OrderOption>
              isLoading={isOrdersLoading}
              options={orderOptions}
              value={orderOptions.find((o) => o.value === field.value) ?? null}
              onValueChange={(opt) => {
                field.onChange(opt?.value ?? null);
                form.setValue(
                  "commonName",
                  opt ? opt.commonName || "Code signing certificate" : ""
                );
              }}
              getOptionLabel={(opt) => opt.label}
              getOptionValue={(opt) => opt.value}
              placeholder="Issue a new certificate"
              searchPlaceholder="Search orders..."
              searchAriaLabel="Search orders"
              clearAriaLabel="Clear existing order"
              emptyMessage="No existing orders found."
            />
            <FieldDescription>Leave empty to issue a new certificate.</FieldDescription>
          </FieldContent>
        </Field>
      )}
    />
  );
};
