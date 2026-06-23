import { useEffect, useRef, useState } from "react";
import { useController, useFormContext } from "react-hook-form";
import { components, MultiValue, OptionProps } from "react-select";
import {
  Building2Icon,
  CheckIcon,
  GlobeIcon,
  KeyIcon,
  LockIcon,
  type LucideIcon,
  ScanSearchIcon,
  ShieldCheckIcon,
  UsersIcon
} from "lucide-react";
import { z } from "zod";

import { FilterableSelect, FormControl } from "@app/components/v2";
import { AuditLogStreamProduct } from "@app/hooks/api/auditLogStreams/enums";

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

const PRODUCT_ICONS: Record<AuditLogStreamProduct, LucideIcon> = {
  [AuditLogStreamProduct.SecretManager]: KeyIcon,
  [AuditLogStreamProduct.CertificateManager]: ShieldCheckIcon,
  [AuditLogStreamProduct.KMS]: LockIcon,
  [AuditLogStreamProduct.SecretScanning]: ScanSearchIcon,
  [AuditLogStreamProduct.PAM]: UsersIcon,
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
      <div className="border-b border-mineshaft-600">
        <components.Option {...props} isSelected={isAllProducts}>
          <div className="flex flex-row items-center gap-2">
            <GlobeIcon className="size-4 shrink-0 text-mineshaft-300" />
            <p className="mr-auto truncate">{children}</p>
            {isAllProducts && <CheckIcon className="ml-2 size-4 shrink-0 text-primary" />}
          </div>
        </components.Option>
      </div>
    );
  }

  const Icon = PRODUCT_ICONS[props.data.value];

  return (
    <components.Option isSelected={isSelected} {...props}>
      <div className="flex flex-row items-center gap-2">
        <Icon className="size-4 shrink-0 text-mineshaft-300" />
        <p className="mr-auto truncate">{children}</p>
        {isSelected && <CheckIcon className="ml-2 size-4 shrink-0 text-primary" />}
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
    <FormControl
      label="Products"
      isOptional
      tooltipText="Only stream audit logs for the selected products. Leave empty to stream every product. Select 'Organization' to include org-level events (e.g. SSO, members, settings)."
    >
      <div ref={containerRef}>
        <FilterableSelect
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
          menuListClassName="max-h-[18rem] overflow-y-auto thin-scrollbar"
          components={{ Option: ProductOptionItem }}
          menuPortalTarget={menuPortalTarget ?? undefined}
          menuPlacement="auto"
        />
      </div>
    </FormControl>
  );
};
