import {
  ArrayPath,
  Control,
  Controller,
  FieldValues,
  Path,
  useFieldArray,
  useWatch
} from "react-hook-form";
import { Info, ListFilter, Plus, Trash2 } from "lucide-react";
import { z } from "zod";

import {
  Button,
  Empty,
  EmptyContent,
  EmptyMedia,
  EmptyTitle,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  CodeSigningScopeField,
  codeSigningScopeFieldDescriptions,
  codeSigningScopeFieldLabels,
  codeSigningScopeFieldMatchRules,
  MONOSPACED_SCOPE_FIELDS,
  TCodeSigningScope
} from "@app/hooks/api/signers";

const MAX_COMMAND_LENGTH = 32767;
const MAX_SCOPE_TEXT_LENGTH = 256;
const SHA256_HEX = /^[a-fA-F0-9]{64}$/;

const validateScopeValue = (field: CodeSigningScopeField, value: string): string | undefined => {
  switch (field) {
    case CodeSigningScopeField.SigningApplicationHash:
    case CodeSigningScopeField.DataHash:
      return SHA256_HEX.test(value) ? undefined : "Must be a 64-character SHA-256 hex string";
    case CodeSigningScopeField.IpAddress:
      return z.string().ip().safeParse(value).success ? undefined : "Must be a valid IP address";
    case CodeSigningScopeField.Command:
      return value.length <= MAX_COMMAND_LENGTH
        ? undefined
        : `Must be ${MAX_COMMAND_LENGTH} characters or fewer`;
    default:
      return value.length <= MAX_SCOPE_TEXT_LENGTH
        ? undefined
        : `Must be ${MAX_SCOPE_TEXT_LENGTH} characters or fewer`;
  }
};

export const SigningScopeSchema = z
  .array(
    z.object({
      field: z.nativeEnum(CodeSigningScopeField),
      value: z.string().trim()
    })
  )
  .superRefine((entries, ctx) => {
    const seen = new Set<CodeSigningScopeField>();
    entries.forEach((entry, index) => {
      if (!entry.value) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "value"],
          message: "Enter a value, or remove this parameter"
        });
        return;
      }
      const problem = validateScopeValue(entry.field, entry.value);
      if (problem) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [index, "value"], message: problem });
      }
      if (seen.has(entry.field)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "field"],
          message: `${codeSigningScopeFieldLabels[entry.field]} is already scoped`
        });
      }
      seen.add(entry.field);
    });
  });

type TScopeEntry = { field: CodeSigningScopeField; value: string };

export const pickDeclaredScope = (
  entries: TScopeEntry[] | undefined
): TCodeSigningScope | undefined => {
  const declared: TCodeSigningScope = {};
  entries?.forEach(({ field, value }) => {
    const trimmed = value?.trim();
    if (trimmed) declared[field] = trimmed;
  });
  return Object.keys(declared).length > 0 ? declared : undefined;
};

const FIELD_PLACEHOLDERS: Record<CodeSigningScopeField, string> = {
  [CodeSigningScopeField.Command]: "signtool sign /fd sha256 /f cert.pfx installer-v2.4.0.msi",
  [CodeSigningScopeField.SigningApplication]: "signtool.exe",
  [CodeSigningScopeField.SigningApplicationHash]:
    "8f677ab944beafd2cc37af6c173beb116b91b2400c9dfd3b7ae218b15b3c11b3",
  [CodeSigningScopeField.Hostname]: "win-build-agent-02",
  [CodeSigningScopeField.OsUsername]: "svc-release",
  [CodeSigningScopeField.IpAddress]: "203.0.113.10",
  [CodeSigningScopeField.DataHash]:
    "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
};

const SCOPE_FIELD_ORDER = Object.values(CodeSigningScopeField);

const ScopeFieldHint = ({ field }: { field?: CodeSigningScopeField }) => {
  if (!field) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="mt-2.5 shrink-0">
          <Info className="size-3.5 text-muted" />
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs space-y-1.5">
        <p>{codeSigningScopeFieldDescriptions[field]}</p>
        <p>{codeSigningScopeFieldMatchRules[field]}</p>
      </TooltipContent>
    </Tooltip>
  );
};

type Props<TFieldValues extends FieldValues & { scope?: TScopeEntry[] }> = {
  control: Control<TFieldValues>;
};

export const ScopeFieldsFormSection = <
  TFieldValues extends FieldValues & { scope?: TScopeEntry[] }
>({
  control
}: Props<TFieldValues>) => {
  const { fields, append, remove } = useFieldArray({
    control,
    name: "scope" as ArrayPath<TFieldValues>
  });
  const entries = useWatch({ control, name: "scope" as Path<TFieldValues> }) as
    | TScopeEntry[]
    | undefined;
  const used = new Set(entries?.map((entry) => entry?.field));
  const nextUnused = SCOPE_FIELD_ORDER.find((field) => !used.has(field));
  const addParameter = () => {
    if (nextUnused) append({ field: nextUnused, value: "" } as never);
  };

  return (
    <div>
      <FieldTitle>Scope this request (Optional)</FieldTitle>
      <FieldDescription>
        Left empty, the access covers any signing situation. Anything you add has to match on every
        sign call, so a mismatch is denied even when signatures remain.
      </FieldDescription>

      <div className="mt-3">
        <div className="flex flex-col gap-2">
          {fields.length === 0 && (
            <Empty className="border py-8">
              <EmptyMedia variant="icon">
                <ListFilter />
              </EmptyMedia>
              <EmptyTitle>No parameters added</EmptyTitle>
              <EmptyContent>
                <Button type="button" variant="outline" size="sm" onClick={addParameter}>
                  <Plus className="size-4" /> Add parameter
                </Button>
              </EmptyContent>
            </Empty>
          )}

          {fields.map((row, index) => (
            <div key={row.id} className="flex items-start gap-2">
              <Controller
                name={`scope.${index}.field` as Path<TFieldValues>}
                control={control}
                render={({ field, fieldState: { error } }) => (
                  <Field className="w-48 shrink-0">
                    <FieldContent>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger className="w-full" isError={Boolean(error)}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent position="popper">
                          {SCOPE_FIELD_ORDER.map((scopeField) => (
                            <SelectItem
                              key={scopeField}
                              value={scopeField}
                              description={codeSigningScopeFieldDescriptions[scopeField]}
                            >
                              {codeSigningScopeFieldLabels[scopeField]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FieldError errors={[error]} />
                    </FieldContent>
                  </Field>
                )}
              />
              <ScopeFieldHint field={entries?.[index]?.field} />
              <Controller
                name={`scope.${index}.value` as Path<TFieldValues>}
                control={control}
                render={({ field, fieldState: { error } }) => {
                  const selected = entries?.[index]?.field;
                  return (
                    <Field className="flex-1">
                      <FieldContent>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          placeholder={selected ? FIELD_PLACEHOLDERS[selected] : ""}
                          className={
                            selected && MONOSPACED_SCOPE_FIELDS.includes(selected)
                              ? "font-mono text-xs"
                              : undefined
                          }
                          isError={Boolean(error)}
                        />
                        <FieldError errors={[error]} />
                      </FieldContent>
                    </Field>
                  );
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Remove parameter"
                onClick={() => remove(index)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}

          {nextUnused && fields.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={addParameter}
            >
              <Plus className="size-4" /> Add parameter
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
