import { useController, useFormContext } from "react-hook-form";
import { Building2Icon, CheckIcon, GlobeIcon, Info, type LucideIcon } from "lucide-react";
import { z } from "zod";

import {
  Combobox,
  Field,
  FieldLabel,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { getProjectLucideIcon } from "@app/helpers/project";
import { AuditLogStreamProduct } from "@app/hooks/api/auditLogStreams/enums";
import { ProjectType } from "@app/hooks/api/projects/types";

// Shared across every provider form so product scoping stays consistent. Re-exported into each
// provider's form schema (`...auditLogStreamFiltersSchema.shape`) and rendered via <ProductsField />.
export const auditLogStreamFiltersSchema = z.object({
  filters: z
    .object({
      products: z.nativeEnum(AuditLogStreamProduct).array().nullish()
    })
    .nullish()
});

// Display labels for each product. Shared with the stream table so naming stays consistent.
export const AUDIT_LOG_STREAM_PRODUCT_LABELS: Record<AuditLogStreamProduct, string> = {
  [AuditLogStreamProduct.SecretManager]: "Secret Management",
  [AuditLogStreamProduct.CertificateManager]: "Certificate Manager",
  [AuditLogStreamProduct.KMS]: "KMS",
  [AuditLogStreamProduct.SecretScanning]: "Secret Scanning",
  [AuditLogStreamProduct.PAM]: "PAM",
  [AuditLogStreamProduct.AgentVault]: "Agent Vault",
  [AuditLogStreamProduct.Organization]: "Organization"
};

// Reuse the shared project icons so the select (and the stream table) match the Projects pages.
// Organization isn't a project type, so it keeps its own org-level icon.
export const PRODUCT_ICONS: Record<AuditLogStreamProduct, LucideIcon> = {
  [AuditLogStreamProduct.SecretManager]: getProjectLucideIcon(ProjectType.SecretManager),
  [AuditLogStreamProduct.CertificateManager]: getProjectLucideIcon(ProjectType.CertificateManager),
  [AuditLogStreamProduct.KMS]: getProjectLucideIcon(ProjectType.KMS),
  [AuditLogStreamProduct.SecretScanning]: getProjectLucideIcon(ProjectType.SecretScanning),
  [AuditLogStreamProduct.PAM]: getProjectLucideIcon(ProjectType.PAM),
  [AuditLogStreamProduct.AgentVault]: getProjectLucideIcon(ProjectType.AgentVault),
  [AuditLogStreamProduct.Organization]: Building2Icon
};

const PRODUCTS = [
  AuditLogStreamProduct.Organization,
  AuditLogStreamProduct.SecretManager,
  AuditLogStreamProduct.CertificateManager,
  AuditLogStreamProduct.KMS,
  AuditLogStreamProduct.SecretScanning,
  AuditLogStreamProduct.PAM,
  AuditLogStreamProduct.AgentVault
];

// Sentinel for the pinned "All products" entry — the default (no filter = stream everything).
// It's never stored; selecting it just clears the product list.
const ALL_VALUE = "__all__";

type ProductOption = {
  value: AuditLogStreamProduct | typeof ALL_VALUE;
  label: string;
};

const ALL_OPTION: ProductOption = { value: ALL_VALUE, label: "All products" };

const PRODUCT_OPTIONS: ProductOption[] = PRODUCTS.map((product) => ({
  value: product,
  label: AUDIT_LOG_STREAM_PRODUCT_LABELS[product]
}));

type FilterFormShape = {
  filters?: { products?: AuditLogStreamProduct[] } | null;
};

export const ProductsField = () => {
  const { control } = useFormContext<FilterFormShape>();
  const { field } = useController({ control, name: "filters.products" });

  const selected = field.value ?? [];
  const value = PRODUCT_OPTIONS.filter((option) =>
    selected.includes(option.value as AuditLogStreamProduct)
  );

  return (
    <Field>
      <FieldLabel htmlFor="products">
        Products <span className="text-muted">(optional)</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Info />
          </TooltipTrigger>
          <TooltipContent className="max-w-sm">
            Only stream audit logs for the selected products. Leave empty to stream every product.
            Select &apos;Organization&apos; to include org-level events (e.g. SSO, members,
            settings).
          </TooltipContent>
        </Tooltip>
      </FieldLabel>
      <Combobox
        id="products"
        multiple
        value={value}
        options={[ALL_OPTION, ...PRODUCT_OPTIONS]}
        onValueChange={(newValue) => {
          // Picking "All products" clears the filter (= stream everything).
          if (newValue.some((option) => option.value === ALL_VALUE)) {
            field.onChange([]);
            return;
          }

          const next = newValue
            .map((option) => option.value)
            .filter(
              (productValue): productValue is AuditLogStreamProduct => productValue !== ALL_VALUE
            );
          // Empty selection is "stream everything"; selecting every product is the same intent,
          // so normalize it back to an empty list.
          field.onChange(next.length === PRODUCTS.length ? [] : next);
        }}
        placeholder="All products"
        searchAriaLabel="Search products"
        getOptionValue={(option) => option.value}
        getOptionKeywords={(option) => [option.value]}
        getOptionLabel={(option) => option.label}
        renderOption={(option) => {
          const Icon = option.value === ALL_VALUE ? GlobeIcon : PRODUCT_ICONS[option.value];

          return (
            <span className="flex items-center gap-2">
              <Icon className="size-4 shrink-0 text-muted" />
              <span className="truncate">{option.label}</span>
            </span>
          );
        }}
        renderOptionIndicator={(option, { isSelected }) =>
          (isSelected || (option.value === ALL_VALUE && selected.length === 0)) && (
            <CheckIcon className="size-4" />
          )
        }
      />
    </Field>
  );
};
