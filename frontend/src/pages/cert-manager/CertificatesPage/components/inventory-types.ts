import type { TInventoryViewFilters } from "@app/hooks/api/certificateInventoryViews/types";

export type FilterRule = {
  id: string;
  field: string;
  operator: string;
  value: string | string[] | number | Date | null;
};

export type FilterFieldDefinition = {
  key: string;
  label: string;
  operators: { value: string; label: string }[];
  valueType: "text" | "number" | "date" | "select" | "multi-select";
  options?: { value: string; label: string }[];
};

export const FILTER_FIELDS: FilterFieldDefinition[] = [
  {
    key: "status",
    label: "Status",
    operators: [{ value: "in", label: "in" }],
    valueType: "multi-select",
    options: [
      { value: "active", label: "Active" },
      { value: "expired", label: "Expired" },
      { value: "revoked", label: "Revoked" }
    ]
  },
  {
    key: "notAfter",
    label: "Expiration Date",
    operators: [
      { value: "before", label: "before" },
      { value: "after", label: "after" }
    ],
    valueType: "date"
  },
  {
    key: "notBefore",
    label: "Issued Date",
    operators: [
      { value: "before", label: "before" },
      { value: "after", label: "after" }
    ],
    valueType: "date"
  },
  {
    key: "enrollmentType",
    label: "Enrollment Method",
    operators: [{ value: "in", label: "in" }],
    valueType: "multi-select",
    options: [
      { value: "acme", label: "ACME" },
      { value: "api", label: "API" },
      { value: "est", label: "EST" },
      { value: "scep", label: "SCEP" }
    ]
  },
  {
    key: "keyAlgorithm",
    label: "Algorithm",
    operators: [{ value: "in", label: "in" }],
    valueType: "multi-select",
    options: [
      { value: "RSA_2048", label: "RSA-2048" },
      { value: "RSA_3072", label: "RSA-3072" },
      { value: "RSA_4096", label: "RSA-4096" },
      { value: "EC_prime256v1", label: "ECDSA-P256" },
      { value: "EC_secp384r1", label: "ECDSA-P384" },
      { value: "EC_secp521r1", label: "ECDSA-P521" }
    ]
  },
  {
    key: "keySize",
    label: "Key Size",
    operators: [{ value: "in", label: "in" }],
    valueType: "multi-select",
    options: [
      { value: "256", label: "256-bit (ECDSA)" },
      { value: "384", label: "384-bit (ECDSA)" },
      { value: "521", label: "521-bit (ECDSA)" },
      { value: "2048", label: "2048-bit (RSA)" },
      { value: "3072", label: "3072-bit (RSA)" },
      { value: "4096", label: "4096-bit (RSA)" }
    ]
  },
  {
    key: "source",
    label: "Source",
    operators: [{ value: "in", label: "in" }],
    valueType: "multi-select",
    options: [
      { value: "issued", label: "Managed" },
      { value: "discovered", label: "Discovered" },
      { value: "imported", label: "Imported" }
    ]
  },
  {
    key: "caId",
    label: "Certificate Authority",
    operators: [{ value: "in", label: "in" }],
    valueType: "multi-select",
    options: []
  },
  {
    key: "profileId",
    label: "Profile",
    operators: [{ value: "in", label: "in" }],
    valueType: "multi-select",
    options: []
  }
];

export const filtersToSearchParams = (rules: FilterRule[]): TInventoryViewFilters => {
  const params: TInventoryViewFilters = {};

  rules.forEach((rule) => {
    switch (rule.field) {
      case "status":
        if (Array.isArray(rule.value) && rule.value.length > 0) {
          params.status = rule.value.join(",");
        }
        break;
      case "notAfter":
        if (rule.operator === "before" && rule.value) {
          params.notAfterTo = new Date(rule.value as string);
        } else if (rule.operator === "after" && rule.value) {
          params.notAfterFrom = new Date(rule.value as string);
        }
        break;
      case "notBefore":
        if (rule.operator === "before" && rule.value) {
          params.notBeforeTo = new Date(rule.value as string);
        } else if (rule.operator === "after" && rule.value) {
          params.notBeforeFrom = new Date(rule.value as string);
        }
        break;
      case "enrollmentType":
        if (Array.isArray(rule.value) && rule.value.length > 0) {
          params.enrollmentTypes = rule.value;
        }
        break;
      case "keyAlgorithm":
        if (Array.isArray(rule.value) && rule.value.length > 0) {
          params.keyAlgorithm = rule.value;
        } else if (rule.value) {
          params.keyAlgorithm = rule.value as string;
        }
        break;
      case "source":
        if (Array.isArray(rule.value) && rule.value.length > 0) {
          params.source = rule.value;
        } else if (rule.value) {
          params.source = rule.value as string;
        }
        break;
      case "keySize":
        if (Array.isArray(rule.value) && rule.value.length > 0) {
          params.keySizes = rule.value.map(Number);
        }
        break;
      case "caId":
        if (Array.isArray(rule.value) && rule.value.length > 0) {
          params.caIds = rule.value;
        }
        break;
      case "profileId":
        if (Array.isArray(rule.value) && rule.value.length > 0) {
          params.profileIds = rule.value;
        }
        break;
      default:
        break;
    }
  });

  return params;
};

export const getFilterChipLabel = (
  rule: FilterRule,
  dynamicFieldOptions?: Record<string, { value: string; label: string }[]>
): string => {
  const baseDef = FILTER_FIELDS.find((f) => f.key === rule.field);
  const fieldLabel = baseDef?.label || rule.field;

  const options =
    dynamicFieldOptions && dynamicFieldOptions[rule.field]
      ? dynamicFieldOptions[rule.field]
      : baseDef?.options || [];

  if (Array.isArray(rule.value)) {
    const values = rule.value;
    if (values.length === 1) {
      const opt = options.find((o) => o.value === values[0]);
      return `${fieldLabel}: ${opt?.label || values[0]}`;
    }
    return `${fieldLabel}: ${values.length} selected`;
  }

  if (rule.value instanceof Date) {
    return `${fieldLabel} ${rule.operator} ${rule.value.toLocaleDateString()}`;
  }

  if (typeof rule.value === "string" && (rule.field === "notAfter" || rule.field === "notBefore")) {
    return `${fieldLabel} ${rule.operator} ${rule.value}`;
  }

  if (typeof rule.value === "number") {
    return `${fieldLabel}: ${rule.value}`;
  }

  const opt = options.find((o) => o.value === rule.value);
  return `${fieldLabel}: ${opt?.label || rule.value}`;
};

export const getFilterMultiSelectLabels = (
  rule: FilterRule,
  dynamicFieldOptions?: Record<string, { value: string; label: string }[]>
): string[] => {
  if (!Array.isArray(rule.value)) return [];

  const baseDef = FILTER_FIELDS.find((f) => f.key === rule.field);
  const options =
    dynamicFieldOptions && dynamicFieldOptions[rule.field]
      ? dynamicFieldOptions[rule.field]
      : baseDef?.options || [];

  return rule.value.map((v) => {
    const opt = options.find((o) => o.value === v);
    return opt?.label || String(v);
  });
};
