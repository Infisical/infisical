import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FormControl,
  Modal,
  ModalClose,
  ModalContent,
  Select,
  SelectItem,
  Switch
} from "@app/components/v2";
import { SECRET_SYNC_IMPORT_BEHAVIOR_MAP, SECRET_SYNC_MAP } from "@app/helpers/secretSyncs";
import {
  SecretSyncImportBehavior,
  TSecretSync,
  useTriggerSecretSyncImportSecrets
} from "@app/hooks/api/secretSyncs";

type Props = {
  secretSync?: TSecretSync;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

type ContentProps = {
  secretSync: TSecretSync;
  onComplete: () => void;
};

const FormSchema = z.object({
  importBehavior: z.nativeEnum(SecretSyncImportBehavior),
  filterForSchema: z.boolean(),
  stripSchema: z.boolean()
});

type TFormData = z.infer<typeof FormSchema>;

const Content = ({ secretSync, onComplete }: ContentProps) => {
  const {
    id: syncId,
    destination,
    projectId,
    syncOptions: { keySchema }
  } = secretSync;
  const destinationName = SECRET_SYNC_MAP[destination].name;

  const {
    handleSubmit,
    control,
    formState: { isSubmitting, isDirty }
  } = useForm<TFormData>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      filterForSchema: false,
      stripSchema: false
    }
  });

  const triggerImportSecrets = useTriggerSecretSyncImportSecrets();

  const handleTriggerImportSecrets = async ({
    importBehavior,
    filterForSchema,
    stripSchema
  }: TFormData) => {
    try {
      await triggerImportSecrets.mutateAsync({
        syncId,
        destination,
        importBehavior,
        projectId,
        filterForSchema,
        stripSchema
      });

      createNotification({
        text: `Successfully triggered secret import for ${destinationName} Sync`,
        type: "success"
      });

      onComplete();
    } catch (err) {
      console.error(err);

      createNotification({
        text: `Failed to trigger secret import for ${destinationName} Sync`,
        type: "error"
      });
    }
  };

  return (
    <form onSubmit={handleSubmit(handleTriggerImportSecrets)}>
      <p className="mb-8 text-sm text-mineshaft-200">
        Are you sure you want to import secrets from this {destinationName} destination into
        Infiscal?
      </p>
      <Controller
        name="importBehavior"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            tooltipClassName="max-w-lg py-3"
            tooltipText={
              <div className="flex flex-col gap-3">
                <p>
                  Specify how Infisical should resolve importing secrets from {destinationName}. The
                  following options are available:
                </p>
                <ul className="flex list-disc flex-col gap-3 pl-4">
                  {Object.values(SECRET_SYNC_IMPORT_BEHAVIOR_MAP).map((details) => {
                    const { name, description } = details(destinationName);

                    return (
                      <li key={name}>
                        <p className="text-mineshaft-300">
                          <span className="font-medium text-bunker-200">{name}</span>: {description}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </div>
            }
            errorText={error?.message}
            isError={Boolean(error?.message)}
            label="Import Behavior"
          >
            <Select
              value={value}
              onValueChange={(val) => onChange(val)}
              className="w-full border border-mineshaft-500"
              position="popper"
              placeholder="Select an option..."
              dropdownContainerClassName="max-w-none"
            >
              {Object.entries(SECRET_SYNC_IMPORT_BEHAVIOR_MAP).map(([key, details]) => {
                const { name } = details(destinationName);

                return (
                  <SelectItem value={key} key={key}>
                    {name}
                  </SelectItem>
                );
              })}
            </Select>
          </FormControl>
        )}
      />
      {keySchema && (
        <>
          <Controller
            control={control}
            name="filterForSchema"
            defaultValue
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <FormControl
                tooltipClassName="max-w-md"
                tooltipText={
                  <div className="flex flex-col gap-2">
                    <p>
                      If enabled, Infisical will only import destination secrets that match your key
                      schema:
                    </p>
                    <code className="text-mineshaft-300">{keySchema}</code>
                  </div>
                }
                label="Filter Keys for Schema"
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <Switch
                  id="filter-for-schema"
                  thumbClassName="bg-mineshaft-800"
                  isChecked={value}
                  onCheckedChange={onChange}
                >
                  Only import destination secrets that match schema
                </Switch>
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="stripSchema"
            defaultValue
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <FormControl
                tooltipClassName="max-w-md"
                tooltipText="If enabled, Infisical will strip secret keys according to your schema. Keys that do not match the schema will not be affected."
                label="Strip Schema"
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <Switch
                  id="strip-schema"
                  thumbClassName="bg-mineshaft-800"
                  isChecked={value}
                  onCheckedChange={onChange}
                >
                  Strip schema from imported secret keys
                </Switch>
              </FormControl>
            )}
          />
        </>
      )}
      <div className="mt-8 flex w-full items-center justify-between gap-2">
        <ModalClose asChild>
          <Button colorSchema="secondary" variant="plain">
            Cancel
          </Button>
        </ModalClose>
        <Button
          type="submit"
          isDisabled={isSubmitting || !isDirty}
          isLoading={isSubmitting}
          colorSchema="secondary"
        >
          Import Secrets
        </Button>
      </div>
    </form>
  );
};

export const SecretSyncImportSecretsModal = ({ isOpen, onOpenChange, secretSync }: Props) => {
  if (!secretSync) return null;

  const destinationName = SECRET_SYNC_MAP[secretSync.destination].name;

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        title="Import Secrets"
        subTitle={`Import secrets into Infisical from this ${destinationName} Sync destination.`}
      >
        <Content secretSync={secretSync} onComplete={() => onOpenChange(false)} />
      </ModalContent>
    </Modal>
  );
};
