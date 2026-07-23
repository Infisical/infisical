import { Control, Controller } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";

import {
  Button,
  Field,
  FieldError,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { CertSubjectAttributeType } from "@app/pages/cert-manager/PoliciesPage/components/CertificatePoliciesTab/shared/certificate-constants";

export type SubjectAttribute = {
  type: CertSubjectAttributeType;
  value: string;
};

const SUBJECT_ATTRIBUTE_LABELS: Record<CertSubjectAttributeType, string> = {
  [CertSubjectAttributeType.COMMON_NAME]: "Common Name",
  [CertSubjectAttributeType.ORGANIZATION]: "Organization",
  [CertSubjectAttributeType.ORGANIZATIONAL_UNIT]: "Organizational Unit",
  [CertSubjectAttributeType.COUNTRY]: "Country",
  [CertSubjectAttributeType.STATE]: "State/Province",
  [CertSubjectAttributeType.LOCALITY]: "Locality",
  [CertSubjectAttributeType.DOMAIN_COMPONENT]: "Domain Component"
};

const getSubjectAttributePlaceholder = (type: CertSubjectAttributeType): string => {
  switch (type) {
    case CertSubjectAttributeType.COMMON_NAME:
      return "example.com";
    case CertSubjectAttributeType.ORGANIZATION:
      return "Acme Inc.";
    case CertSubjectAttributeType.ORGANIZATIONAL_UNIT:
      return "Engineering";
    case CertSubjectAttributeType.COUNTRY:
      return "US";
    case CertSubjectAttributeType.STATE:
      return "California";
    case CertSubjectAttributeType.LOCALITY:
      return "San Francisco";
    case CertSubjectAttributeType.DOMAIN_COMPONENT:
      return "example";
    default:
      return "";
  }
};

type SubjectAttributesFieldProps = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<any>;
  allowedAttributeTypes: CertSubjectAttributeType[];
  error?: string;
  shouldUnregister?: boolean;
  namePrefix?: string;
};

export const SubjectAttributesField = ({
  control,
  allowedAttributeTypes,
  error,
  shouldUnregister,
  namePrefix = "subjectAttributes"
}: SubjectAttributesFieldProps) => {
  return (
    <Controller
      control={control}
      name={namePrefix}
      shouldUnregister={shouldUnregister}
      render={({ field: { onChange, value } }) => {
        const currentValues: SubjectAttribute[] = value || [];
        const usedTypes = currentValues.map((attr) => attr.type);
        // Domain components are multi-valued, so they may appear in more than one row.
        const isMultiValued = (type: CertSubjectAttributeType) =>
          type === CertSubjectAttributeType.DOMAIN_COMPONENT;
        const availableTypes = allowedAttributeTypes.filter(
          (type) => isMultiValued(type) || !usedTypes.includes(type)
        );
        const canAddMore = availableTypes.length > 0;

        return (
          <Field className="mb-4">
            <FieldLabel>Subject Attributes</FieldLabel>
            <div className="space-y-2">
              {currentValues.map((attr, index) => {
                const selectableTypes = allowedAttributeTypes.filter(
                  (type) => type === attr.type || isMultiValued(type) || !usedTypes.includes(type)
                );

                return (
                  <div
                    // eslint-disable-next-line react/no-array-index-key
                    key={`subject-attr-${attr.type}-${index}`}
                    className="flex items-start gap-2"
                  >
                    <Select
                      value={attr.type}
                      onValueChange={(newType) => {
                        const newValue = [...currentValues];
                        newValue[index] = { ...attr, type: newType as CertSubjectAttributeType };
                        onChange(newValue);
                      }}
                    >
                      <SelectTrigger className="w-52">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent position="popper">
                        {selectableTypes.map((attrType) => (
                          <SelectItem key={attrType} value={attrType}>
                            {SUBJECT_ATTRIBUTE_LABELS[attrType]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      value={attr.value}
                      onChange={(e) => {
                        const newValue = [...currentValues];
                        newValue[index] = { ...attr, value: e.target.value };
                        onChange(newValue);
                      }}
                      placeholder={getSubjectAttributePlaceholder(attr.type)}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onChange(currentValues.filter((_, i) => i !== index))}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                );
              })}
              {canAddMore && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    onChange([...currentValues, { type: availableTypes[0], value: "" }])
                  }
                >
                  <Plus className="size-4" /> Add Subject Attribute
                </Button>
              )}
            </div>
            <FieldError>{error}</FieldError>
          </Field>
        );
      }}
    />
  );
};
