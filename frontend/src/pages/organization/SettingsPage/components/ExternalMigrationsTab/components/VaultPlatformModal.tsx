import { Controller, useForm } from "react-hook-form";
import { faQuestionCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input, Tooltip } from "@app/components/v2";
import { NoticeBannerV2 } from "@app/components/v2/NoticeBannerV2/NoticeBannerV2";
import { useImportVault } from "@app/hooks/api/migration/mutations";

type Props = {
  id?: string;
  onClose: () => void;
};

enum VaultMappingType {
  KeyVault = "key-vault",
  Namespace = "namespace"
}

const MAPPING_TYPE_MENU_ITEMS = [
  {
    value: VaultMappingType.KeyVault,
    label: "Key Vaults",
    tooltip: (
      <div>
        When using key vaults for mapping, each key vault within Vault will be created in Infisical
        as a project. Each secret path inside the key vault, will be created as an environment
        inside the corresponding project. When using Key Vaults as the project mapping type, a
        default environment called &quot;Production&quot; will be created for each project, which
        will contain the secrets from the key vault.
        <div className="mt-4 flex flex-col gap-1 text-sm">
          <div>Key Vault → Project</div>
          <div>Default Environment (Production)</div>
          <div>Secret Path → Secret Folder</div>
          <div>Secret data → Secrets</div>
        </div>
      </div>
    )
  },
  {
    value: VaultMappingType.Namespace,
    label: "Namespaces",
    tooltip: (
      <div>
        When using namespaces for mapping, each namespace within Vault will be created in Infisical
        as a project. Each key vault (KV) inside the namespace, will be created as an environment
        inside the corresponding project.
        <div className="mt-4 flex flex-col gap-1 text-sm">
          <div>Namespace → Project</div>
          <div>Key Vault → Project Environment</div>
          <div>Secret Path → Secret Folder</div>
          <div>Secret data → Secrets</div>
        </div>
      </div>
    )
  }
];

export const VaultPlatformModal = ({ onClose }: Props) => {
  const formSchema = z.object({
    vaultUrl: z.string().min(1),
    vaultNamespace: z.string().trim().optional(),
    vaultAccessToken: z.string().min(1),
    mappingType: z.nativeEnum(VaultMappingType).default(VaultMappingType.KeyVault)
  });
  type TFormData = z.infer<typeof formSchema>;

  const { mutateAsync: importVault } = useImportVault();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isLoading, isDirty, isSubmitting, isValid, errors }
  } = useForm<TFormData>({
    resolver: zodResolver(formSchema)
  });

  console.log({
    isSubmitting,
    isLoading,
    isValid,
    errors
  });

  const onSubmit = async (data: TFormData) => {
    await importVault({
      vaultAccessToken: data.vaultAccessToken,
      vaultNamespace: data.vaultNamespace,
      vaultUrl: data.vaultUrl,
      mappingType: data.mappingType
    });
    createNotification({
      title: "Import started",
      text: "Your data is being imported. You will receive an email when the import is complete or if the import fails. This may take up to 10 minutes.",
      type: "info"
    });

    onClose();
    reset();
  };

  return (
    <div>
      <NoticeBannerV2 title="Vault KV Secret Engine Import" className="mb-4">
        <p className="text-sm">
          The Vault migration currently supports importing static secrets from Vault
          Dedicated/Self-Hosted.
          <div className="mt-2 text-xs opacity-80">
            Currently only KV Secret Engine V2 is supported for Vault migrations.
          </div>
        </p>
      </NoticeBannerV2>
      <form onSubmit={handleSubmit(onSubmit)} autoComplete="off">
        <Controller
          control={control}
          name="vaultUrl"
          render={({ field, fieldState: { error } }) => (
            <FormControl
              label="Vault URL"
              isRequired
              errorText={error?.message}
              isError={Boolean(error)}
            >
              <Input placeholder="" {...field} />
            </FormControl>
          )}
        />
        <Controller
          control={control}
          name="vaultNamespace"
          render={({ field, fieldState: { error } }) => (
            <FormControl
              label="Vault Namespace"
              errorText={error?.message}
              isError={Boolean(error)}
            >
              <Input type="text" placeholder="" {...field} />
            </FormControl>
          )}
        />
        <Controller
          control={control}
          name="vaultAccessToken"
          render={({ field, fieldState: { error } }) => (
            <FormControl
              label="Vault Access Token"
              isRequired
              errorText={error?.message}
              isError={Boolean(error)}
            >
              <Input type="password" placeholder="" {...field} />
            </FormControl>
          )}
        />
        <Controller
          control={control}
          name="mappingType"
          defaultValue={VaultMappingType.KeyVault}
          render={({ field, fieldState: { error } }) => (
            <FormControl
              label="Project Mapping"
              isError={Boolean(error)}
              isRequired
              errorText={error?.message}
              className="flex-1"
            >
              <div className="mt-2 grid h-full w-full grid-cols-2 gap-4">
                {MAPPING_TYPE_MENU_ITEMS.map((el) => (
                  <div
                    key={el.value}
                    className={twMerge(
                      "flex w-full cursor-pointer flex-col items-center gap-2 rounded border border-mineshaft-600 p-4 opacity-75 transition-all",
                      field.value === el.value
                        ? "border-primary-700 border-opacity-70 bg-mineshaft-600 opacity-100"
                        : "hover:border-primary-700 hover:bg-mineshaft-600"
                    )}
                    onClick={() => field.onChange(el.value)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        field.onChange(el.value);
                      }
                    }}
                  >
                    <div className="flex items-center gap-1">
                      <div className="text-center text-sm">{el.label}</div>
                      {el.tooltip && (
                        <div className="text-center text-sm">
                          <Tooltip content={el.tooltip} className="max-w-96">
                            <FontAwesomeIcon className="opacity-60" icon={faQuestionCircle} />
                          </Tooltip>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </FormControl>
          )}
        />

        <div className="mt-6 flex items-center space-x-4">
          <Button
            type="submit"
            isLoading={isLoading}
            isDisabled={!isDirty || isSubmitting || isLoading || !isValid}
          >
            Import data
          </Button>
          <Button variant="outline_bg" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
};
