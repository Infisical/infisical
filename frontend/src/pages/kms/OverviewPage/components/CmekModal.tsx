import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Button,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  TextArea,
  Toggle
} from "@app/components/v3";
import { useProject, useSubscription } from "@app/context";
import { keyUsageDefaultOption, kmsKeyUsageOptions } from "@app/helpers/kms";
import {
  AllowedEncryptionKeyAlgorithms,
  AsymmetricKeyAlgorithm,
  HmacAlgorithm,
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
  algorithm: z.enum(AllowedEncryptionKeyAlgorithms),
  keyUsage: z.nativeEnum(KmsKeyUsage),
  isExportable: z.boolean(),
  hasDeleteProtection: z.boolean()
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
  const { currentProject } = useProject();
  const projectId = currentProject.id;
  const isUpdate = !!cmek;
  const { subscription } = useSubscription();

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
      description: cmek?.description ?? undefined,
      algorithm: SymmetricKeyAlgorithm.AES_GCM_256,
      keyUsage: KmsKeyUsage.ENCRYPT_DECRYPT,
      isExportable: cmek?.isExportable ?? true,
      hasDeleteProtection: cmek?.hasDeleteProtection ?? false
    }
  });

  const handleCreateCmek = async ({
    algorithm,
    name,
    description,
    keyUsage,
    isExportable,
    hasDeleteProtection
  }: FormData) => {
    const mutation = isUpdate
      ? updateCmek.mutateAsync({
          keyId: cmek.id,
          projectId,
          name,
          description,
          hasDeleteProtection
        })
      : createCmek.mutateAsync({
          projectId,
          name,
          description,
          keyUsage,
          algorithm: algorithm as AsymmetricKeyAlgorithm | SymmetricKeyAlgorithm | HmacAlgorithm,
          isExportable,
          hasDeleteProtection
        });

    await mutation;
    createNotification({
      text: `Successfully ${isUpdate ? "updated" : "added"} key`,
      type: "success"
    });
    onComplete();
  };

  const selectedKeyUsage = watch("keyUsage");

  return (
    <form onSubmit={handleSubmit(handleCreateCmek)} className="flex min-h-0 flex-1 flex-col">
      <div className="thin-scrollbar flex-1 space-y-4 overflow-y-auto p-4">
        <Field data-invalid={Boolean(errors.name)}>
          <FieldLabel htmlFor="cmek-name">
            Name{" "}
            <span aria-hidden className="text-danger">
              *
            </span>
          </FieldLabel>
          <Input
            id="cmek-name"
            autoFocus
            placeholder="my-secret-key"
            {...register("name")}
            autoComplete="off"
            aria-required
            isError={Boolean(errors.name)}
          />
          <FieldDescription>Name must be slug-friendly.</FieldDescription>
          <FieldError>{errors.name?.message}</FieldError>
        </Field>
        <div className="space-y-4">
          {!isUpdate && (
            <>
              <Controller
                control={control}
                name="keyUsage"
                render={({ field: { onChange, value: keyUsage }, fieldState: { error } }) => (
                  <Field data-invalid={Boolean(error)}>
                    <FieldLabel htmlFor="cmek-key-usage">Key Usage</FieldLabel>
                    <Select
                      value={keyUsage}
                      onValueChange={(e) => {
                        onChange(e);
                        if (keyUsageDefaultOption[e as KmsKeyUsage]) {
                          setValue("algorithm", keyUsageDefaultOption[e as KmsKeyUsage], {
                            shouldDirty: true,
                            shouldValidate: true
                          });
                        }
                      }}
                    >
                      <SelectTrigger
                        id="cmek-key-usage"
                        className="w-full"
                        isError={Boolean(error)}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(KmsKeyUsage)?.map(([key, value]) => (
                          <SelectItem value={value} key={`key-usage-${key}`}>
                            {kmsKeyUsageOptions[value].label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldDescription>{kmsKeyUsageOptions[keyUsage].tooltip}</FieldDescription>
                    <FieldError>{error?.message}</FieldError>
                  </Field>
                )}
              />
              <Controller
                control={control}
                name="algorithm"
                render={({ field: { onChange, value: algorithm }, fieldState: { error } }) => (
                  <Field data-invalid={Boolean(error)}>
                    <FieldLabel htmlFor="cmek-algorithm">Algorithm</FieldLabel>
                    <Select key={selectedKeyUsage} value={algorithm} onValueChange={onChange}>
                      <SelectTrigger
                        id="cmek-algorithm"
                        className="w-full"
                        isError={Boolean(error)}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
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
                            if (selectedKeyUsage === KmsKeyUsage.GENERATE_VERIFY_MAC) {
                              return Object.values(HmacAlgorithm).includes(
                                value as unknown as HmacAlgorithm
                              );
                            }

                            return false;
                          })
                          // eslint-disable-next-line @typescript-eslint/no-unused-vars
                          .map(([_, value]) => {
                            const isPqc = value.startsWith("ML_DSA");
                            const isDisabled = isPqc && !subscription?.kmsPqc;
                            const isLegacyHmac =
                              value === HmacAlgorithm.HMAC_SHA_1 ||
                              value === HmacAlgorithm.HMAC_SHA_224;
                            return (
                              <SelectItem
                                value={value}
                                key={`encryption-algorithm-${value}`}
                                isDisabled={isDisabled}
                              >
                                <div className="flex items-center gap-2">
                                  <span className="uppercase">{value.replaceAll("-", " ")}</span>
                                  {isDisabled && <Badge variant="info">Enterprise</Badge>}
                                  {isLegacyHmac && <Badge variant="warning">Legacy</Badge>}
                                </div>
                              </SelectItem>
                            );
                          })}
                      </SelectContent>
                    </Select>
                    <FieldError>{error?.message}</FieldError>
                  </Field>
                )}
              />
            </>
          )}
        </div>
        <Field data-invalid={Boolean(errors.description)}>
          <FieldLabel htmlFor="cmek-description">Description (optional)</FieldLabel>
          <TextArea
            id="cmek-description"
            className="min-h-24"
            {...register("description")}
            isError={Boolean(errors.description)}
          />
          <FieldError>{errors.description?.message}</FieldError>
        </Field>
        {!isUpdate && (
          <Controller
            control={control}
            name="isExportable"
            render={({ field: { onChange, value } }) => (
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldTitle>Allow Export</FieldTitle>
                  <FieldDescription>
                    Allow users with the export permission to export this key&apos;s material. This
                    cannot be changed after the key is created.
                  </FieldDescription>
                </FieldContent>
                <Toggle
                  id="is-exportable"
                  aria-label="Allow Export"
                  variant="project"
                  checked={value}
                  onCheckedChange={onChange}
                />
              </Field>
            )}
          />
        )}
        <Controller
          control={control}
          name="hasDeleteProtection"
          render={({ field: { onChange, value } }) => (
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>Delete Protection</FieldTitle>
                <FieldDescription>
                  Prevents this key from being deleted while enabled.
                </FieldDescription>
              </FieldContent>
              <Toggle
                id="has-delete-protection"
                aria-label="Delete Protection"
                variant="project"
                checked={value}
                onCheckedChange={onChange}
              />
            </Field>
          )}
        />
      </div>
      <SheetFooter className="justify-end border-t">
        <SheetClose asChild>
          <Button variant="ghost" type="button">
            Cancel
          </Button>
        </SheetClose>
        <Button variant="project" type="submit" isPending={isSubmitting} isDisabled={isSubmitting}>
          {isUpdate ? "Update" : "Add"} Key
        </Button>
      </SheetFooter>
    </form>
  );
};

export const CmekModal = ({ isOpen, onOpenChange, cmek }: Props) => {
  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{cmek ? "Update" : "Add"} Key</SheetTitle>
          <SheetDescription>
            Configure the key and its supported cryptographic operations.
          </SheetDescription>
        </SheetHeader>
        {isOpen && (
          <CmekForm key={cmek?.id ?? "new"} onComplete={() => onOpenChange(false)} cmek={cmek} />
        )}
      </SheetContent>
    </Sheet>
  );
};
