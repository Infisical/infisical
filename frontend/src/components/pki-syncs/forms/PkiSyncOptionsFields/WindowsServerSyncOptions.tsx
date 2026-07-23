import { Controller, useFieldArray, useFormContext } from "react-hook-form";
import { Info, Plus, Trash2 } from "lucide-react";

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
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { WindowsFileAccess } from "@app/hooks/api/pkiSyncs";

import { TPkiSyncForm } from "../schemas/pki-sync-schema";
import { ServerExportFormatFields } from "./ServerExportFormatFields";

type Props = {
  isUpdate?: boolean;
};

export const WindowsServerSyncOptions = ({ isUpdate }: Props) => {
  const { control } = useFormContext<TPkiSyncForm>();
  const {
    fields: accessRuleFields,
    append: appendAccessRule,
    remove: removeAccessRule
  } = useFieldArray({ control, name: "syncOptions.fileAccessRules" as never });

  return (
    <>
      <ServerExportFormatFields isUpdate={isUpdate} />
      <Field className="mb-4">
        <FieldLabel>
          File Permissions <span className="text-muted">(optional)</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info />
            </TooltipTrigger>
            <TooltipContent className="max-w-sm">
              Grant Windows users or groups access to the delivered files (for example, restrict who
              can read the private key). Rules are added on top of the destination folder&apos;s
              inherited permissions.
            </TooltipContent>
          </Tooltip>
        </FieldLabel>
        <div className="flex flex-col gap-2">
          {accessRuleFields.map((ruleField, index) => (
            <div key={ruleField.id} className="flex items-start gap-2">
              <Controller
                control={control}
                name={`syncOptions.fileAccessRules.${index}.identity` as never}
                render={({ field, fieldState: { error } }) => (
                  <Field className="mb-0 flex-1">
                    <Input
                      {...field}
                      value={(field.value as string) ?? ""}
                      placeholder="DOMAIN\svc-account"
                      isError={Boolean(error)}
                    />
                    <FieldError errors={[error]} />
                  </Field>
                )}
              />
              <Controller
                control={control}
                name={`syncOptions.fileAccessRules.${index}.access` as never}
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <Field className="mb-0 w-40">
                    <Select
                      value={(value as WindowsFileAccess) ?? WindowsFileAccess.Read}
                      onValueChange={onChange}
                    >
                      <SelectTrigger className="w-full" isError={Boolean(error)}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent position="popper">
                        <SelectItem value={WindowsFileAccess.Read}>Read</SelectItem>
                        <SelectItem value={WindowsFileAccess.Modify}>Modify</SelectItem>
                        <SelectItem value={WindowsFileAccess.FullControl}>Full Control</SelectItem>
                      </SelectContent>
                    </Select>
                    <FieldError errors={[error]} />
                  </Field>
                )}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Remove permission rule"
                className="mt-1"
                onClick={() => removeAccessRule(index)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => appendAccessRule({ identity: "", access: WindowsFileAccess.Read })}
            >
              <Plus className="size-4" /> Add Permission
            </Button>
          </div>
        </div>
      </Field>
    </>
  );
};
