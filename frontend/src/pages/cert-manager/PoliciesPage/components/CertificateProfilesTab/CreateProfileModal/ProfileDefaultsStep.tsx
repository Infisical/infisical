import { useMemo } from "react";
import { Control, Controller, UseFormSetValue, UseFormWatch } from "react-hook-form";
import { FileBadge, Plus, Trash2 } from "lucide-react";

import {
  Button,
  Checkbox,
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import {
  EXTENDED_KEY_USAGES_OPTIONS,
  KEY_USAGES_OPTIONS
} from "@app/hooks/api/certificates/constants";
import {
  CertSubjectAlternativeNameType,
  CertSubjectAttributeType,
  formatSANType,
  formatSubjectAttributeType
} from "@app/pages/cert-manager/PoliciesPage/components/CertificatePoliciesTab/shared/certificate-constants";

import type { FormData } from "../CreateProfileModal";

export type PolicyConstraints = {
  allowedKeyUsages: string[];
  allowedExtendedKeyUsages: string[];
  requiredKeyUsages: string[];
  requiredExtendedKeyUsages: string[];
  allowedSignatureAlgorithms: Array<{ value: string; label: string }>;
  allowedKeyAlgorithms: Array<{ value: string; label: string }>;
  allowedSubjectAttributeTypes: CertSubjectAttributeType[];
  shouldShowSubjectSection: boolean;
  allowedSanTypes: CertSubjectAlternativeNameType[];
  shouldShowSanSection: boolean;
  policyAllowsCA: boolean;
  maxPathLength: number | undefined;
};

const NO_DEFAULT = "__none__";

const isMultiValuedAttribute = (type: CertSubjectAttributeType) =>
  type === CertSubjectAttributeType.DOMAIN_COMPONENT;

const subjectAttrPlaceholder = (type: CertSubjectAttributeType): string => {
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

const SectionHeading = ({ title, description }: { title: string; description: string }) => (
  <div>
    <p className="text-sm font-medium text-foreground">{title}</p>
    <p className="mt-0.5 text-xs text-muted">{description}</p>
  </div>
);

type EditableEntry<T extends string> = { type: T; value: string };

type AttributeListEditorProps<T extends string> = {
  title: string;
  description: string;
  emptyMessage: string;
  keyPrefix: string;
  selectTriggerClassName: string;
  items: EditableEntry<T>[];
  getSelectableTypes: (entry: EditableEntry<T>, index: number) => T[];
  formatType: (type: T) => string;
  getPlaceholder: (type: T) => string;
  onItemsChange: (next: EditableEntry<T>[]) => void;
  showAddButton: boolean;
  addButtonLabel: string;
  onAdd: () => void;
};

const AttributeListEditor = <T extends string>({
  title,
  description,
  emptyMessage,
  keyPrefix,
  selectTriggerClassName,
  items,
  getSelectableTypes,
  formatType,
  getPlaceholder,
  onItemsChange,
  showAddButton,
  addButtonLabel,
  onAdd
}: AttributeListEditorProps<T>) => (
  <div>
    <SectionHeading title={title} description={description} />
    <div className="mt-4 space-y-3">
      {items.length === 0 && <p className="text-xs text-muted">{emptyMessage}</p>}
      {items.map((entry, index) => {
        const selectableTypes = getSelectableTypes(entry, index);
        return (
          // eslint-disable-next-line react/no-array-index-key
          <div key={`${keyPrefix}${index}`} className="flex items-start gap-2">
            <Select
              value={entry.type}
              onValueChange={(value) => {
                const next = [...items];
                next[index] = { ...entry, type: value as T };
                onItemsChange(next);
              }}
            >
              <SelectTrigger className={selectTriggerClassName}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {selectableTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {formatType(type)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder={getPlaceholder(entry.type)}
              value={entry.value}
              className="flex-1"
              onChange={(e) => {
                const next = [...items];
                next[index] = { ...entry, value: e.target.value };
                onItemsChange(next);
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onItemsChange(items.filter((_, i) => i !== index))}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        );
      })}
      {showAddButton && (
        <Button type="button" variant="outline" size="sm" onClick={onAdd}>
          <Plus className="size-4" /> {addButtonLabel}
        </Button>
      )}
    </div>
  </div>
);

type KeyUsageGridProps = {
  title: string;
  description: string;
  idPrefix: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  requiredUsages: string[];
  values: Record<string, boolean | undefined>;
  onChange: (next: Record<string, boolean>) => void;
};

const KeyUsageGrid = ({
  title,
  description,
  idPrefix,
  options,
  requiredUsages,
  values,
  onChange
}: KeyUsageGridProps) => (
  <div>
    <SectionHeading title={title} description={description} />
    <div className="mt-4 grid grid-cols-2 gap-3">
      {options.map((option) => {
        const isRequired = requiredUsages.includes(option.value);
        return (
          <div key={option.value} className="flex items-center gap-3">
            <Checkbox
              id={`${idPrefix}${option.value}`}
              variant="project"
              isChecked={isRequired || Boolean(values[option.value])}
              isDisabled={isRequired}
              onCheckedChange={(checked) => {
                if (isRequired) return;
                onChange({ ...values, [option.value]: Boolean(checked) } as Record<
                  string,
                  boolean
                >);
              }}
            />
            <label
              htmlFor={`${idPrefix}${option.value}`}
              className="flex cursor-pointer items-center gap-2 text-sm text-foreground"
            >
              {option.label}
              {isRequired && <span className="text-xs text-muted">(Required)</span>}
            </label>
          </div>
        );
      })}
    </div>
  </div>
);

type Props = {
  control: Control<FormData>;
  watch: UseFormWatch<FormData>;
  setValue: UseFormSetValue<FormData>;
  policyConstraints: PolicyConstraints;
  isAwsAcmPublicCa: boolean;
};

export const ProfileDefaultsStep = ({
  control,
  watch,
  setValue,
  policyConstraints,
  isAwsAcmPublicCa
}: Props) => {
  const watchedPolicyId = watch("certificatePolicyId");
  const watchedDefaultsIsCA = watch("defaults.basicConstraints.isCA") || false;
  const watchedDefaultSubjectAttrs = watch("defaults.subjectAttributes") || [];
  const watchedDefaultSans = watch("defaults.subjectAltNames") || [];
  const watchedDefaultSigAlg = watch("defaults.signatureAlgorithm") ?? null;
  const watchedDefaultKeyAlg = watch("defaults.keyAlgorithm") ?? null;
  const watchedDefaultKeyUsages = watch("defaults.keyUsages") || {};
  const watchedDefaultExtKeyUsages = watch("defaults.extendedKeyUsages") || {};

  const filteredKeyUsages = useMemo(
    () =>
      KEY_USAGES_OPTIONS.filter(({ value }) => policyConstraints.allowedKeyUsages.includes(value)),
    [policyConstraints.allowedKeyUsages]
  );

  const filteredExtendedKeyUsages = useMemo(
    () =>
      EXTENDED_KEY_USAGES_OPTIONS.filter(({ value }) =>
        policyConstraints.allowedExtendedKeyUsages.includes(value)
      ),
    [policyConstraints.allowedExtendedKeyUsages]
  );

  const usedAttributeTypes = watchedDefaultSubjectAttrs.map(
    (attr: { type: CertSubjectAttributeType; value: string }) => attr.type
  );
  const availableAttributeTypes = policyConstraints.allowedSubjectAttributeTypes.filter(
    (type) => isMultiValuedAttribute(type) || !usedAttributeTypes.includes(type)
  );

  if (!watchedPolicyId) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileBadge />
          </EmptyMedia>
          <EmptyTitle>
            Select a certificate policy on the Issuer step to configure defaults.
          </EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="space-y-8">
      <Controller
        name="defaults.ttlDays"
        control={control}
        render={({ field, fieldState: { error } }) => (
          <Field>
            <FieldLabel>Time to Live (TTL) in Days</FieldLabel>
            <FieldContent>
              <Input
                type="number"
                placeholder="e.g. 365"
                value={field.value == null ? "" : field.value}
                isError={Boolean(error)}
                disabled={isAwsAcmPublicCa}
                onChange={(e) => {
                  const val = e.target.value;
                  field.onChange(val === "" ? null : Number(val));
                }}
              />
              <FieldDescription>
                {isAwsAcmPublicCa
                  ? "AWS ACM Public CA issues certificates with a fixed 198-day validity. This field cannot be changed."
                  : "Fallback validity period used when not explicitly specified in a certificate request. Leave empty for no TTL default."}
              </FieldDescription>
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />

      {policyConstraints.shouldShowSubjectSection && (
        <AttributeListEditor<CertSubjectAttributeType>
          title="Subject Attributes"
          description="Default subject attribute values applied when a request omits them."
          emptyMessage="No subject attribute defaults configured."
          keyPrefix="def-attr-"
          selectTriggerClassName="w-52"
          items={watchedDefaultSubjectAttrs}
          getSelectableTypes={(attr) =>
            policyConstraints.allowedSubjectAttributeTypes.filter(
              (type) =>
                type === attr.type ||
                isMultiValuedAttribute(type) ||
                !usedAttributeTypes.includes(type)
            )
          }
          formatType={formatSubjectAttributeType}
          getPlaceholder={subjectAttrPlaceholder}
          onItemsChange={(next) => setValue("defaults.subjectAttributes", next)}
          showAddButton={availableAttributeTypes.length > 0}
          addButtonLabel="Add attribute"
          onAdd={() =>
            setValue("defaults.subjectAttributes", [
              ...watchedDefaultSubjectAttrs,
              { type: availableAttributeTypes[0], value: "" }
            ])
          }
        />
      )}

      {policyConstraints.shouldShowSanSection && (
        <AttributeListEditor<CertSubjectAlternativeNameType>
          title="Subject Alternative Names"
          description="Default subject alternative names applied when a request omits them."
          emptyMessage="No SAN defaults configured."
          keyPrefix="def-san-"
          selectTriggerClassName="w-40"
          items={watchedDefaultSans}
          getSelectableTypes={() => policyConstraints.allowedSanTypes}
          formatType={formatSANType}
          getPlaceholder={() => "example.com or *.example.com"}
          onItemsChange={(next) => setValue("defaults.subjectAltNames", next)}
          showAddButton
          addButtonLabel="Add SAN"
          onAdd={() =>
            setValue("defaults.subjectAltNames", [
              ...watchedDefaultSans,
              {
                type:
                  policyConstraints.allowedSanTypes[0] ?? CertSubjectAlternativeNameType.DNS_NAME,
                value: ""
              }
            ])
          }
        />
      )}

      {(policyConstraints.allowedSignatureAlgorithms.length > 0 ||
        policyConstraints.allowedKeyAlgorithms.length > 0) && (
        <div>
          <SectionHeading
            title="Algorithms"
            description="Default signature and key algorithms applied when a request omits them."
          />
          <div className="mt-4 flex gap-3">
            {policyConstraints.allowedSignatureAlgorithms.length > 0 && (
              <Field className="flex-1">
                <FieldLabel>Signature Algorithm</FieldLabel>
                <FieldContent>
                  <Select
                    value={watchedDefaultSigAlg ?? NO_DEFAULT}
                    onValueChange={(value) =>
                      setValue("defaults.signatureAlgorithm", value === NO_DEFAULT ? null : value)
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      <SelectItem value={NO_DEFAULT}>No default</SelectItem>
                      {policyConstraints.allowedSignatureAlgorithms.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldContent>
              </Field>
            )}
            {policyConstraints.allowedKeyAlgorithms.length > 0 && (
              <Field className="flex-1">
                <FieldLabel>Key Algorithm</FieldLabel>
                <FieldContent>
                  <Select
                    value={watchedDefaultKeyAlg ?? NO_DEFAULT}
                    onValueChange={(value) =>
                      setValue("defaults.keyAlgorithm", value === NO_DEFAULT ? null : value)
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      <SelectItem value={NO_DEFAULT}>No default</SelectItem>
                      {policyConstraints.allowedKeyAlgorithms.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldContent>
              </Field>
            )}
          </div>
        </div>
      )}

      {filteredKeyUsages.length > 0 && (
        <KeyUsageGrid
          title="Key Usages"
          description="Key usages applied by default to issued certificates."
          idPrefix="def-ku-"
          options={filteredKeyUsages}
          requiredUsages={policyConstraints.requiredKeyUsages}
          values={watchedDefaultKeyUsages}
          onChange={(next) => setValue("defaults.keyUsages", next)}
        />
      )}

      {filteredExtendedKeyUsages.length > 0 && (
        <KeyUsageGrid
          title="Extended Key Usages"
          description="Extended key usages applied by default to issued certificates."
          idPrefix="def-eku-"
          options={filteredExtendedKeyUsages}
          requiredUsages={policyConstraints.requiredExtendedKeyUsages}
          values={watchedDefaultExtKeyUsages}
          onChange={(next) => setValue("defaults.extendedKeyUsages", next)}
        />
      )}

      {policyConstraints.policyAllowsCA && (
        <div>
          <SectionHeading
            title="Basic Constraints"
            description="Control whether issued certificates act as a CA by default."
          />
          <div className="mt-4 space-y-4">
            <Controller
              control={control}
              name="defaults.basicConstraints.isCA"
              render={({ field: { value, onChange } }) => (
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="defaults-isCA"
                    variant="project"
                    isChecked={value || false}
                    onCheckedChange={(checked) => {
                      onChange(checked);
                      if (!checked) {
                        setValue("defaults.basicConstraints.pathLength", undefined);
                      }
                    }}
                  />
                  <span className="text-sm text-foreground">
                    Issue as Certificate Authority
                    <span className="mt-1 block text-xs text-muted">
                      Certificates will default to the CA:TRUE extension.
                    </span>
                  </span>
                </div>
              )}
            />

            {watchedDefaultsIsCA && (
              <Controller
                control={control}
                name="defaults.basicConstraints.pathLength"
                render={({ field, fieldState: { error } }) => (
                  <Field>
                    <FieldLabel>Path Length</FieldLabel>
                    <FieldContent>
                      <Input
                        {...field}
                        type="number"
                        min={0}
                        placeholder="Leave empty for no constraint"
                        isError={Boolean(error)}
                        value={field.value ?? ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === "") {
                            field.onChange(null);
                          } else {
                            const numVal = parseInt(val, 10);
                            field.onChange(Number.isNaN(numVal) ? null : numVal);
                          }
                        }}
                      />
                      <FieldDescription>
                        How many sub-CA levels can exist below this certificate.
                      </FieldDescription>
                      <FieldError errors={[error]} />
                    </FieldContent>
                  </Field>
                )}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};
