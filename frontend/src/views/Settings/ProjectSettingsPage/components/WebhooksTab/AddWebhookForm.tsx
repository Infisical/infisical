import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { faInfo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";

import {
  Button,
  FormControl,
  Input,
  Modal,
  ModalClose,
  ModalContent,
  Select,
  SelectItem,
  Tooltip
} from "@app/components/v2";

const formSchema = yup.object({
  environment: yup.string().required().trim().label("Environment"),
  webhookUrl: yup.string().url().required().trim().label("Webhook URL"),
  webhookSecretKey: yup.string().trim().label("Secret Key"),
  secretPath: yup.string().required().trim().label("Secret Path")
});

export type TFormSchema = yup.InferType<typeof formSchema>;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onCreateWebhook: (data: TFormSchema) => void;
  environments?: Array<{ slug: string; name: string }>;
};

export const AddWebhookForm = ({
  isOpen,
  onOpenChange,
  onCreateWebhook,
  environments = []
}: Props) => {
  const {
    control,
    handleSubmit,
    register,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<TFormSchema>({
    resolver: yupResolver(formSchema)
  });
  const [showTip, setShowTip] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) {
      reset();
    }
  }, [isOpen]);

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent title="Create a new webhook">
        <form onSubmit={handleSubmit(onCreateWebhook)}>
          <div>
            <Controller
              control={control}
              name="environment"
              defaultValue={environments?.[0]?.slug}
              render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                <FormControl
                  label="Environment"
                  isRequired
                  errorText={error?.message}
                  isError={Boolean(error)}
                >
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
            <FormControl
              label="Secret Path"
              icon={
                <Tooltip
                  isOpen={showTip}
                  onOpenChange={setShowTip}
                  content={
                    <div>
                      <h4 className="mb-2">Here are some examples of glob patterns:</h4>
                      <div className="ol-listStyleType">
                        <li>
                          <code className="text-primary">/</code> - Matches all files and
                          directories in the current directory
                        </li>
                        <li>
                          <code className="text-primary">**/*</code> - Matches all files and
                          directories in the current directory and its subdirectories
                        </li>
                        <li>
                          <code className="text-primary">{"/{dir1,dir2}"}</code> - Matches all files
                          and directories in dir1 and dir2
                        </li>
                      </div>
                    </div>
                  }
                  position="right"
                  className="text-xs"
                >
                  <div
                    className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-[1px] border-white"
                    onMouseEnter={() => setShowTip(true)}
                  >
                    <FontAwesomeIcon icon={faInfo} className="h-2 w-2" />
                  </div>
                </Tooltip>
              }
              isRequired
              isError={Boolean(errors?.secretPath)}
              errorText={errors?.secretPath?.message}
              helperText="Glob patterns are used to match multiple files or directories"
            >
              <Input
                placeholder="glob pattern / or /**/* or /{dir1,dir2}"
                {...register("secretPath")}
              />
            </FormControl>
            <FormControl
              label="Secret Key"
              isError={Boolean(errors?.webhookSecretKey)}
              errorText={errors?.webhookSecretKey?.message}
              helperText="To generate webhook signature for verification"
            >
              <Input
                placeholder="Provided during webhook setup"
                {...register("webhookSecretKey")}
              />
            </FormControl>
            <FormControl
              label="Webhook URL"
              isRequired
              isError={Boolean(errors?.webhookUrl)}
              errorText={errors?.webhookUrl?.message}
            >
              <Input {...register("webhookUrl")} />
            </FormControl>
          </div>
          <div className="mt-8 flex items-center">
            <Button
              className="mr-4"
              type="submit"
              isDisabled={isSubmitting}
              isLoading={isSubmitting}
            >
              Create
            </Button>
            <ModalClose asChild>
              <Button variant="plain" colorSchema="secondary">
                Cancel
              </Button>
            </ModalClose>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
