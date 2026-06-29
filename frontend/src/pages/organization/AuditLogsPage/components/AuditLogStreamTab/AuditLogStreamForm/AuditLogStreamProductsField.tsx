import { useEffect, useRef, useState } from "react";
import { useController, useFormContext } from "react-hook-form";
import { components, MultiValue, OptionProps } from "react-select";
import { Building2Icon, CheckIcon, GlobeIcon, Info, type LucideIcon } from "lucide-react";
import { z } from "zod";

import {
  Field,
  FieldLabel,
  FilterableSelect,
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
      products: z.nativeEnum(AuditLogStreamProduct).array().optional()
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
  [AuditLogStreamProduct.Organization]: Building2Icon
};

const PRODUCTS = [
  AuditLogStreamProduct.Organization,
  AuditLogStreamProduct.SecretManager,
  AuditLogStreamProduct.CertificateManager,
  AuditLogStreamProduct.KMS,
  AuditLogStreamProduct.SecretScanning,
  AuditLogStreamProduct.PAM
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

const ProductOptionItem = ({ isSelected, children, ...props }: OptionProps<ProductOption>) => {
  // The "All products" row is pinned to the top and divided from the rest. It reads as selected
  // whenever no specific products are chosen (the default).
  if (props.data.value === ALL_VALUE) {
    const isAllProducts = (props.getValue() as ProductOption[]).length === 0;

    return (
      <div className="border-b border-border">
        <components.Option {...props} isSelected={isAllProducts}>
          <div className="flex flex-row items-center gap-2">
            <GlobeIcon className="size-4 shrink-0 text-muted" />
            <p className="mr-auto truncate">{children}</p>
            {isAllProducts && <CheckIcon className="ml-2 size-4 shrink-0" />}
          </div>
        </components.Option>
      </div>
    );
  }

  const Icon = PRODUCT_ICONS[props.data.value];

  return (
    <components.Option isSelected={isSelected} {...props}>
      <div className="flex flex-row items-center gap-2">
        <Icon className="size-4 shrink-0 text-muted" />
        <p className="mr-auto truncate">{children}</p>
        {isSelected && <CheckIcon className="ml-2 size-4 shrink-0" />}
      </div>
    </components.Option>
  );
};

export const ProductsField = () => {
  const { control } = useFormContext<FilterFormShape>();
  const { field } = useController({ control, name: "filters.products" });
  const containerRef = useRef<HTMLDivElement>(null);
  // Portal the menu into the enclosing modal so it can overflow the modal's scrollable body
  // instead of being clipped. Targeting the dialog (not document.body) keeps it inside Radix's
  // focus trap so options stay clickable. Falls back to inline rendering outside a modal.
  const [menuPortalTarget, setMenuPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setMenuPortalTarget(containerRef.current?.closest<HTMLElement>('[role="dialog"]') ?? null);
  }, []);

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
      <div ref={containerRef}>
        <FilterableSelect
          inputId="products"
          isMulti
          value={value}
          options={[ALL_OPTION, ...PRODUCT_OPTIONS]}
          onChange={(newValue, actionMeta) => {
            // Picking "All products" clears the filter (= stream everything).
            if (actionMeta.action === "select-option" && actionMeta.option?.value === ALL_VALUE) {
              field.onChange([]);
              return;
            }

            const next = (newValue as MultiValue<ProductOption>)
              .map((option) => option.value)
              .filter(
                (productValue): productValue is AuditLogStreamProduct => productValue !== ALL_VALUE
              );
            // Empty selection is "stream everything" — selecting every product is the same intent,
            // so normalize it back to an empty list.
            field.onChange(next.length === PRODUCTS.length ? [] : next);
          }}
          placeholder="All products"
          getOptionValue={(option) => option.value}
          getOptionLabel={(option) => option.label}
          components={{ Option: ProductOptionItem }}
          menuPortalTarget={menuPortalTarget ?? undefined}
          menuPosition="fixed"
          menuPlacement="auto"
        />
      </div>
    </Field>
  );
};
