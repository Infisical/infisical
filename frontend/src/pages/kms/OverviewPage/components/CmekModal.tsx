import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FormControl,
  Input,
  Modal,
  ModalClose,
  ModalContent,
  Select,
  SelectItem,
  TextArea
} from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { keyUsageDefaultOption, kmsKeyUsageOptions } from "@app/helpers/kms";
import {
  AllowedEncryptionKeyAlgorithms,
  AsymmetricKeyAlgorithm,
  KmsKeyUsage,
  SymmetricKeyAlgorithm,
  TCmek,
  useCreateCmek,
  useUpdateCmek
} from "@app/hooks/api/cmeks";
import { slugSchema } from "@app/lib/schemas";

const formSchema = z.object({
  name: slugSchema({ min: 1, max: 32, field: "Name" }),
  description: z.string().max(500).optional(),
  encryptionAlgorithm: z.enum(AllowedEncryptionKeyAlgorithms),
  keyUsage: z.nativeEnum(KmsKeyUsage)
});

export type FormData = z.infer<typeof formSchema>;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  cmek?: TCmek | null;
};

type FormProps = Pick<Props, "cmek"> & {
  onComplete: () => void;
};

const CmekForm = ({ onComplete, cmek }: FormProps) => {
  const createCmek = useCreateCmek();
  const updateCmek = useUpdateCmek();
  const { currentWorkspace } = useWorkspace();
  const projectId = currentWorkspace.id;
  const isUpdate = !!cmek;

  const {
    control,
    handleSubmit,
    register,
    setValue,
    watch,
    formState: { isSubmitting, errors }
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: cmek?.name,
      description: cmek?.description,
      encryptionAlgorithm: SymmetricKeyAlgorithm.AES_GCM_256,
      keyUsage: KmsKeyUsage.ENCRYPT_DECRYPT
    }
  });

  const handleCreateCmek = async ({
    encryptionAlgorithm,
    name,
    description,
    keyUsage
  }: FormData) => {
    const mutation = isUpdate
      ? updateCmek.mutateAsync({ keyId: cmek.id, projectId, name, description })
      : createCmek.mutateAsync({
          projectId,
          name,
          description,
          keyUsage,
          encryptionAlgorithm: encryptionAlgorithm as AsymmetricKeyAlgorithm | SymmetricKeyAlgorithm
        });

    try {
      await mutation;
      createNotification({
        text: `Successfully ${isUpdate ? "updated" : "added"} key`,
        type: "success"
      });
      onComplete();
    } catch (err) {
      console.error(err);
      createNotification({
        text: `Failed to ${isUpdate ? "update" : "add"} key`,
        type: "error"
      });
    }
  };

  const selectedKeyUsage = watch("keyUsage");

  return (
    <form onSubmit={handleSubmit(handleCreateCmek)}>
      <FormControl
        helperText="Name must be slug-friendly"
        errorText={errors.name?.message}
        isError={Boolean(errors.name?.message)}
        label="Name"
      >
        <Input autoFocus placeholder="my-secret-key" {...register("name")} />
      </FormControl>
      <div className="flex w-full items-center gap-2">
        {!isUpdate && (
          <>
            <Controller
              control={control}
              name="keyUsage"
              render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                <FormControl
                  className="w-full"
                  tooltipText={
                    <div className="space-y-4">
                      {Object.entries(KmsKeyUsage).map(([key, value]) => (
                        <div key={`key-usage-${key}`}>
                          <p className="font-bold">{kmsKeyUsageOptions[value].label}</p>
                          <p>{kmsKeyUsageOptions[value].tooltip}</p>
                        </div>
                      ))}
                    </div>
                  }
                  label="Key Usage"
                  errorText={error?.message}
                  isError={Boolean(error)}
                >
                  <Select
                    defaultValue={field.value}
                    onValueChange={(e) => {
                      if (keyUsageDefaultOption[e as KmsKeyUsage]) {
                        setValue("encryptionAlgorithm", keyUsageDefaultOption[e as KmsKeyUsage], {
                          shouldDirty: true,
                          shouldValidate: true
                        });
                      }

                      onChange(e);
                    }}
                    className="w-full"
                  >
                    {Object.entries(KmsKeyUsage)?.map(([key, value]) => (
                      <SelectItem value={value} key={`key-usage-${key}`}>
                        {kmsKeyUsageOptions[value].label}
                      </SelectItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            />
            <Controller
              control={control}
              name="encryptionAlgorithm"
              render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                <FormControl
                  className="w-full"
                  label="Algorithm"
                  errorText={error?.message}
                  isError={Boolean(error)}
                >
                  <Select
                    defaultValue={field.value}
                    value={field.value}
                    onValueChange={onChange}
                    className="w-full"
                  >
                    {Object.entries(AllowedEncryptionKeyAlgorithms)
                      // eslint-disable-next-line @typescript-eslint/no-unused-vars
                      ?.filter(([_, value]) => {
                        if (selectedKeyUsage === KmsKeyUsage.ENCRYPT_DECRYPT) {
                          return Object.values(SymmetricKeyAlgorithm).includes(
                            value as unknown as SymmetricKeyAlgorithm
                          );
                        }
                        if (selectedKeyUsage === KmsKeyUsage.SIGN_VERIFY) {
                          return Object.values(AsymmetricKeyAlgorithm).includes(
                            value as unknown as AsymmetricKeyAlgorithm
                          );
                        }

                        return false;
                      })
                      // eslint-disable-next-line @typescript-eslint/no-unused-vars
                      .map(([_, value]) => (
                        <SelectItem value={value} key={`encryption-algorithm-${value}`}>
                          <span className="uppercase">{value.replaceAll("-", " ")}</span>
                        </SelectItem>
                      ))}
                  </Select>
                </FormControl>
              )}
            />
          </>
        )}
      </div>
      <FormControl
        label="Description (optional)"
        errorText={errors.description?.message}
        isError={Boolean(errors.description?.message)}
      >
        <TextArea
          className="max-h-[20rem] min-h-[10rem] min-w-full max-w-full"
          {...register("description")}
        />
      </FormControl>
      <div className="flex items-center">
        <Button
          className="mr-4"
          size="sm"
          type="submit"
          isLoading={isSubmitting}
          isDisabled={isSubmitting}
        >
          {isUpdate ? "Update" : "Add"} Key
        </Button>
        <ModalClose asChild>
          <Button colorSchema="secondary" variant="plain">
            Cancel
          </Button>
        </ModalClose>
      </div>
    </form>
  );
};

export const CmekModal = ({ isOpen, onOpenChange, cmek }: Props) => {
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent title={`${cmek ? "Update" : "Add"} Key`}>
        <CmekForm onComplete={() => onOpenChange(false)} cmek={cmek} />
      </ModalContent>
    </Modal>
  );
};
