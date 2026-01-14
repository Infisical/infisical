import { Control, Controller } from "react-hook-form";
import { faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button, FormControl, IconButton, Input, Select, SelectItem } from "@app/components/v2";
import { CertSubjectAttributeType } from "@app/pages/cert-manager/PoliciesPage/components/CertificateTemplatesV2Tab/shared/certificate-constants";

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
  [CertSubjectAttributeType.LOCALITY]: "Locality"
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
    default:
      return "";
  }
};

type SubjectAttributesFieldProps = {
  control: Control<any>;
  allowedAttributeTypes: CertSubjectAttributeType[];
  error?: string;
};

export const SubjectAttributesField = ({
  control,
  allowedAttributeTypes,
  error
}: SubjectAttributesFieldProps) => {
  return (
    <Controller
      control={control}
      name="subjectAttributes"
      render={({ field: { onChange, value } }) => {
        const currentValues = value || [];
        const usedTypes = currentValues.map((attr: SubjectAttribute) => attr.type);
        const availableTypes = allowedAttributeTypes.filter((type) => !usedTypes.includes(type));
        const canAddMore = availableTypes.length > 0;

        return (
          <FormControl label="Subject Attributes" errorText={error} isError={Boolean(error)}>
            <div className="space-y-2">
              {currentValues.map((attr: SubjectAttribute, index: number) => {
                const selectableTypes = allowedAttributeTypes.filter(
                  (type) => type === attr.type || !usedTypes.includes(type)
                );

                return (
                  // eslint-disable-next-line react/no-array-index-key
                  <div key={`subject-attr-${index}`} className="flex items-center gap-2">
                    <Select
                      value={attr.type}
                      onValueChange={(newType) => {
                        const newValue = [...currentValues];
                        newValue[index] = {
                          ...attr,
                          type: newType as CertSubjectAttributeType
                        };
                        onChange(newValue);
                      }}
                      className="w-44"
                    >
                      {selectableTypes.map((attrType) => (
                        <SelectItem key={attrType} value={attrType}>
                          {SUBJECT_ATTRIBUTE_LABELS[attrType]}
                        </SelectItem>
                      ))}
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
                    <IconButton
                      ariaLabel="Remove attribute"
                      variant="plain"
                      size="sm"
                      onClick={() => {
                        const newValue = currentValues.filter((_: any, i: number) => i !== index);
                        onChange(newValue);
                      }}
                    >
                      <FontAwesomeIcon icon={faTrash} />
                    </IconButton>
                  </div>
                );
              })}
              {canAddMore && (
                <Button
                  type="button"
                  variant="outline_bg"
                  size="xs"
                  leftIcon={<FontAwesomeIcon icon={faPlus} />}
                  onClick={() => {
                    const nextType = availableTypes[0];
                    onChange([...currentValues, { type: nextType, value: "" }]);
                  }}
                  className="w-full"
                >
                  Add Subject Attribute
                </Button>
              )}
            </div>
          </FormControl>
        );
      }}
    />
  );
};
