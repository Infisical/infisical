import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import {
  Button,
  Checkbox,
  FormControl,
  Modal,
  ModalContent,
  Select,
  SelectItem
} from "@app/components/v2";
import { SecretPathInput } from "@app/components/v2/SecretPathInput";
import { useWorkspace } from "@app/context";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  popUp: UsePopUpState<["moveSecrets"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["moveSecrets"]>, state?: boolean) => void;
  onMoveApproved: (moveParams: {
    destinationEnvironment: string;
    destinationSecretPath: string;
    shouldOverwrite: boolean;
  }) => void;
};

const formSchema = z.object({
  environment: z.string().trim(),
  secretPath: z
    .string()
    .trim()
    .transform((val) =>
      typeof val === "string" && val.at(-1) === "/" && val.length > 1 ? val.slice(0, -1) : val
    ),
  shouldOverwrite: z.boolean().default(false)
});

type TFormSchema = z.infer<typeof formSchema>;

export const MoveSecretsModal = ({ popUp, handlePopUpToggle, onMoveApproved }: Props) => {
  const {
    handleSubmit,
    control,
    reset,
    watch,
    formState: { isSubmitting }
  } = useForm<TFormSchema>({ resolver: zodResolver(formSchema) });

  const { currentWorkspace } = useWorkspace();
  const environments = currentWorkspace?.environments || [];
  const selectedEnvironment = watch("environment");

  const handleFormSubmit = (data: TFormSchema) => {
    onMoveApproved({
      destinationEnvironment: data.environment,
      destinationSecretPath: data.secretPath,
      shouldOverwrite: data.shouldOverwrite
    });

    handlePopUpToggle("moveSecrets", false);
  };

  return (
    <Modal
      isOpen={popUp.moveSecrets.isOpen}
      onOpenChange={(isOpen) => {
        reset();
        handlePopUpToggle("moveSecrets", isOpen);
      }}
    >
      <ModalContent
        title="Move Secrets"
        subTitle="Move secrets from the current path to the selected destination"
      >
        <form onSubmit={handleSubmit(handleFormSubmit)}>
          <Controller
            control={control}
            name="environment"
            defaultValue={environments?.[0]?.slug}
            render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <FormControl label="Environment" errorText={error?.message} isError={Boolean(error)}>
                <Select
                  defaultValue={field.value}
                  {...field}
                  onValueChange={(e) => onChange(e)}
                  className="w-full"
                >
                  {environments.map(({ name, slug }) => (
                    <SelectItem value={slug} key={slug}>
                      {name}
                    </SelectItem>
                  ))}
                </Select>
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="secretPath"
            defaultValue="/"
            render={({ field, fieldState: { error } }) => (
              <FormControl label="Secret Path" isError={Boolean(error)} errorText={error?.message}>
                <SecretPathInput {...field} environment={selectedEnvironment} />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="shouldOverwrite"
            defaultValue={false}
            render={({ field: { onBlur, value, onChange } }) => (
              <Checkbox
                id="overwrite-checkbox"
                className="ml-2"
                isChecked={value}
                onCheckedChange={onChange}
                onBlur={onBlur}
              >
                Overwrite existing secrets
              </Checkbox>
            )}
          />
          <div className="mt-7 flex items-center">
            <Button
              isDisabled={isSubmitting}
              isLoading={isSubmitting}
              key="move-secrets-submit"
              className="mr-4"
              type="submit"
            >
              Move
            </Button>
            <Button
              key="move-secrets-cancel"
              onClick={() => handlePopUpToggle("moveSecrets", false)}
              variant="plain"
              colorSchema="secondary"
            >
              Cancel
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
