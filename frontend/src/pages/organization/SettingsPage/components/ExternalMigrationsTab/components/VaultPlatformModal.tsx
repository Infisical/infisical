import { Controller, useForm } from "react-hook-form";
import { faQuestionCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { Button, FormControl, Input, Select, SelectItem, Tooltip } from "@app/components/v2";
import { NoticeBannerV2 } from "@app/components/v2/NoticeBannerV2/NoticeBannerV2";
import {
  OrgGatewayPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { gatewaysQueryKeys } from "@app/hooks/api";
import { useHasCustomMigrationAvailable } from "@app/hooks/api/migration";
import { useImportVault } from "@app/hooks/api/migration/mutations";
import { ExternalMigrationProviders } from "@app/hooks/api/migration/types";

type Props = {
  id?: string;
  onClose: () => void;
};

enum VaultMappingType {
  KeyVault = "key-vault",
  Namespace = "namespace",
  Custom = "custom"
}

const MAPPING_TYPE_MENU_ITEMS = [
  {
    isCustom: false,
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
    isCustom: false,
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
  },
  {
    isCustom: true,
    value: VaultMappingType.Custom,
    label: "Custom Migration",
    tooltip: (
      <div>
        Custom migrations allow you to shape your Vault migration to your specific needs. Please
        contact our sales team to get started with custom migrations.
      </div>
    )
  }
];

export const VaultPlatformModal = ({ onClose }: Props) => {
  const { data: isCustomMigrationAvailable } = useHasCustomMigrationAvailable(
    ExternalMigrationProviders.Vault
  );

  const formSchema = z.object({
    vaultUrl: z.string().min(1),
    gatewayId: z.string().optional(),
    vaultNamespace: z.string().trim().optional(),
    vaultAccessToken: z.string().min(1),
    mappingType: z.nativeEnum(VaultMappingType).default(VaultMappingType.KeyVault)
  });
  type TFormData = z.infer<typeof formSchema>;

  const { data: gateways, isPending: isGatewayLoading } = useQuery(gatewaysQueryKeys.list());
  const { mutateAsync: importVault } = useImportVault();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isLoading, isDirty, isSubmitting, isValid }
  } = useForm<TFormData>({
    resolver: zodResolver(formSchema)
  });

  const onSubmit = async (data: TFormData) => {
    await importVault({
      vaultAccessToken: data.vaultAccessToken,
      vaultNamespace: data.vaultNamespace,
      vaultUrl: data.vaultUrl,
      mappingType: data.mappingType,
      ...(data.gatewayId && { gatewayId: data.gatewayId })
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
            Currently only KV Secret Engine is supported for Vault migrations.
          </div>
        </p>
      </NoticeBannerV2>
      <form onSubmit={handleSubmit(onSubmit)} autoComplete="off">
        <div className="w-full flex-1">
          <OrgPermissionCan
            I={OrgGatewayPermissionActions.AttachGateways}
            a={OrgPermissionSubjects.Gateway}
          >
            {(isAllowed) => (
              <Controller
                control={control}
                name="gatewayId"
                defaultValue=""
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <FormControl
                    isError={Boolean(error?.message)}
                    errorText={error?.message}
                    label="Gateway"
                    isOptional
                  >
                    <Tooltip
                      isDisabled={isAllowed}
                      content="Restricted access. You don't have permission to attach gateways to resources."
                    >
                      <div>
                        <Select
                          isDisabled={!isAllowed}
                          value={value as string}
                          onValueChange={(v) => {
                            if (v !== "") {
                              onChange(v);
                            }
                          }}
                          className="w-full border border-mineshaft-500"
                          dropdownContainerClassName="max-w-none"
                          isLoading={isGatewayLoading}
                          placeholder="Default: Internet Gateway"
                          position="popper"
                        >
                          <SelectItem
                            value={undefined as unknown as string}
                            onClick={() => {
                              onChange(undefined);
                            }}
                          >
                            Internet Gateway
                          </SelectItem>
                          {gateways?.map((el) => (
                            <SelectItem value={el.id} key={el.id}>
                              {el.name}
                            </SelectItem>
                          ))}
                        </Select>
                      </div>
                    </Tooltip>
                  </FormControl>
                )}
              />
            )}
          </OrgPermissionCan>
        </div>

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
              <div className="mt-2 grid grid-cols-2 gap-4">
                {MAPPING_TYPE_MENU_ITEMS.map((el) => (
                  <div
                    key={el.value}
                    className={twMerge(
                      "flex w-full cursor-pointer flex-col items-center gap-2 rounded-sm border border-mineshaft-600 p-4 opacity-75 transition-all",
                      field.value === el.value
                        ? "border-opacity-70 border-primary-700 bg-mineshaft-700 opacity-100"
                        : "hover:border-primary-800/75 hover:bg-mineshaft-600",
                      el.isCustom && "col-span-2",
                      el.isCustom &&
                        !isCustomMigrationAvailable?.data?.enabled &&
                        "cursor-not-allowed! border-mineshaft-600! bg-mineshaft-600! opacity-40!"
                    )}
                    onClick={() => {
                      if (el.isCustom && !isCustomMigrationAvailable?.data?.enabled) return;

                      field.onChange(el.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      if (el.isCustom && !isCustomMigrationAvailable?.data?.enabled) return;

                      field.onChange(el.value);
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="flex items-center gap-1">
                      <div className="text-center text-sm">{el.label}</div>
                      {el.tooltip && (
                        <div className="text-center text-sm">
                          <Tooltip content={el.tooltip} className="max-w-96">
                            <FontAwesomeIcon
                              size="sm"
                              className="text-mineshaft-400"
                              icon={faQuestionCircle}
                            />
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
            Import Data
          </Button>
          <Button variant="outline_bg" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
};
