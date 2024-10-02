import { Controller, useForm, useFormContext } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import {
  Button,
  Checkbox,
  FormControl,
  FormLabel,
  ModalClose,
  Select,
  SelectItem
} from "@app/components/v2";
import { ProjectPermissionSub } from "@app/context";

import {
  formSchema,
  PROJECT_PERMISSION_OBJECT,
  TFormSchema
} from "../ProjectRoleModifySection.utils";

type Props = {
  onClose: () => void;
};

export const NewPermissionRule = ({ onClose }: Props) => {
  const rootForm = useFormContext<TFormSchema>();

  const form = useForm<{
    type: ProjectPermissionSub;
    permissions: NonNullable<TFormSchema["permissions"]>;
  }>({
    resolver: zodResolver(
      formSchema.pick({ permissions: true }).extend({ type: z.nativeEnum(ProjectPermissionSub) })
    ),
    defaultValues: {
      type: ProjectPermissionSub.Secrets
    }
  });

  const selectedSubject = form.watch("type");

  return (
    <div>
      <Controller
        control={form.control}
        name="type"
        defaultValue={ProjectPermissionSub.Secrets}
        render={({ field: { onChange, ...field }, fieldState: { error } }) => (
          <FormControl label="Subject" errorText={error?.message} isError={Boolean(error)}>
            <Select
              defaultValue={field.value}
              {...field}
              onValueChange={(e) => onChange(e)}
              className="w-full"
            >
              {Object.keys(PROJECT_PERMISSION_OBJECT).map((subject) => (
                <SelectItem value={subject} key={`permission-create-${subject}`}>
                  {PROJECT_PERMISSION_OBJECT[subject as ProjectPermissionSub].title}
                </SelectItem>
              ))}
            </Select>
          </FormControl>
        )}
      />
      <FormLabel label="Actions" className="my-2" />
      <div className="flex flex-grow flex-wrap justify-start gap-8">
        {PROJECT_PERMISSION_OBJECT?.[selectedSubject]?.actions?.map(({ label, value }) => (
          <Controller
            key={`create-permission-${selectedSubject}-${label}`}
            name={`permissions.${selectedSubject}.0.${value as any}` as any}
            control={form.control}
            defaultValue={false}
            render={({ field }) => (
              <div className="flex items-center justify-center">
                <Checkbox
                  isChecked={field.value}
                  onCheckedChange={field.onChange}
                  id={`new-permissions.${selectedSubject}.0.${String(value)}`}
                >
                  {label}
                </Checkbox>
              </div>
            )}
          />
        ))}
      </div>
      <div className="mt-8 flex space-x-4">
        <Button
          onClick={form.handleSubmit((el) => {
            const rootPolicyValue = rootForm.getValues("permissions")?.[el.type];
            if (rootPolicyValue && selectedSubject === ProjectPermissionSub.Secrets) {
              rootForm.setValue(
                `permissions.${el.type}`,
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore-error akhilmhdh: this is because of ts collision with both
                [...rootPolicyValue, ...(el?.permissions[el.type] || [])],
                { shouldDirty: true, shouldTouch: true }
              );
            } else {
              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              // @ts-ignore-error akhilmhdh: this is because of ts collision with both
              rootForm.setValue(`permissions.${el.type}`, el?.permissions?.[el.type], {
                shouldDirty: true,
                shouldTouch: true
              });
            }
            onClose();
          })}
        >
          Create
        </Button>
        <ModalClose asChild>
          <Button colorSchema="secondary" variant="plain">
            Cancel
          </Button>
        </ModalClose>
      </div>
    </div>
  );
};
