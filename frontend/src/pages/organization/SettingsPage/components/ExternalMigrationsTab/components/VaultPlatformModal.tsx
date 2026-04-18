import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { CircleHelpIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UnstableAlert,
  UnstableAlertDescription,
  UnstableAlertTitle,
  UnstableInput
} from "@app/components/v3";
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

const GATEWAY_NONE = "__gateway_none__";

type VaultGatewaySelectProps = {
  isAllowed: boolean;
  isGatewayLoading: boolean;
  value: string | undefined;
  onChange: (next: string | undefined) => void;
  hasError: boolean;
  gateways?: { id: string; name: string }[];
};

function VaultGatewaySelect({
  isAllowed,
  isGatewayLoading,
  value,
  onChange,
  hasError,
  gateways
}: VaultGatewaySelectProps) {
  const select = (
    <Select
      value={value || GATEWAY_NONE}
      onValueChange={(v) => {
        onChange(v === GATEWAY_NONE ? undefined : v);
      }}
      disabled={!isAllowed || isGatewayLoading}
    >
      <SelectTrigger size="default" className="w-full max-w-none min-w-0" aria-invalid={hasError}>
        <SelectValue placeholder={isGatewayLoading ? "Loading gateways…" : "Internet Gateway"} />
      </SelectTrigger>
      <SelectContent position="popper" className="min-w-(--radix-select-trigger-width)">
        <SelectItem value={GATEWAY_NONE}>Internet Gateway</SelectItem>
        {gateways?.map((el) => (
          <SelectItem value={el.id} key={el.id}>
            {el.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  if (isAllowed) {
    return select;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="block w-full cursor-not-allowed">{select}</span>
      </TooltipTrigger>
      <TooltipContent>
        Restricted access. You don&apos;t have permission to attach gateways to resources.
      </TooltipContent>
    </Tooltip>
  );
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
      <UnstableAlert variant="info" className="mb-4">
        <UnstableAlertTitle>Vault KV Secret Engine Import</UnstableAlertTitle>
        <UnstableAlertDescription>
          <p>
            The Vault migration currently supports importing static secrets from Vault
            Dedicated/Self-Hosted.
          </p>
          <p className="mt-2 text-xs opacity-80">
            Currently only KV Secret Engine is supported for Vault migrations.
          </p>
        </UnstableAlertDescription>
      </UnstableAlert>
      <form onSubmit={handleSubmit(onSubmit)} autoComplete="off" className="space-y-4">
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
                  <Field>
                    <FieldLabel className="inline-flex flex-wrap items-baseline gap-1.5">
                      Gateway
                      <span className="text-xs font-normal text-muted">(optional)</span>
                    </FieldLabel>
                    <FieldContent>
                      <VaultGatewaySelect
                        isAllowed={isAllowed}
                        isGatewayLoading={isGatewayLoading}
                        value={value}
                        onChange={onChange}
                        hasError={Boolean(error)}
                        gateways={gateways}
                      />
                    </FieldContent>
                    <FieldError>{error?.message}</FieldError>
                  </Field>
                )}
              />
            )}
          </OrgPermissionCan>
        </div>

        <Controller
          control={control}
          name="vaultUrl"
          render={({ field, fieldState: { error } }) => (
            <Field>
              <FieldLabel>Vault URL</FieldLabel>
              <FieldContent>
                <UnstableInput placeholder="" {...field} isError={Boolean(error)} />
              </FieldContent>
              <FieldError>{error?.message}</FieldError>
            </Field>
          )}
        />
        <Controller
          control={control}
          name="vaultNamespace"
          render={({ field, fieldState: { error } }) => (
            <Field>
              <FieldLabel>Vault Namespace</FieldLabel>
              <FieldContent>
                <UnstableInput type="text" placeholder="" {...field} isError={Boolean(error)} />
              </FieldContent>
              <FieldError>{error?.message}</FieldError>
            </Field>
          )}
        />
        <Controller
          control={control}
          name="vaultAccessToken"
          render={({ field, fieldState: { error } }) => (
            <Field>
              <FieldLabel>Vault Access Token</FieldLabel>
              <FieldContent>
                <UnstableInput type="password" placeholder="" {...field} isError={Boolean(error)} />
              </FieldContent>
              <FieldError>{error?.message}</FieldError>
            </Field>
          )}
        />
        <Controller
          control={control}
          name="mappingType"
          defaultValue={VaultMappingType.KeyVault}
          render={({ field, fieldState: { error } }) => (
            <Field>
              <FieldLabel>Project Mapping</FieldLabel>
              <FieldContent>
                <div className="mt-2 grid grid-cols-2 gap-4">
                  {MAPPING_TYPE_MENU_ITEMS.map((el) => (
                    <div
                      key={el.value}
                      className={twMerge(
                        "flex w-full cursor-pointer flex-col items-center gap-2 rounded-sm border border-border bg-container/50 p-4 opacity-75 transition-all",
                        field.value === el.value
                          ? "border-project/50 bg-container opacity-100"
                          : "hover:border-accent/30 hover:bg-foreground/5",
                        el.isCustom && "col-span-2",
                        el.isCustom &&
                          !isCustomMigrationAvailable?.data?.enabled &&
                          "pointer-events-none cursor-not-allowed border-border bg-muted/30 opacity-40"
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
                        <div className="text-center text-sm text-foreground">{el.label}</div>
                        {el.tooltip && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="inline-flex text-muted hover:text-foreground"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <CircleHelpIcon className="size-4" aria-label="More info" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-96">{el.tooltip}</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </FieldContent>
              <FieldError>{error?.message}</FieldError>
            </Field>
          )}
        />

        <div className="flex items-center gap-2 pt-2">
          <Button
            type="submit"
            variant="project"
            isPending={isLoading || isSubmitting}
            isDisabled={!isDirty || isSubmitting || isLoading || !isValid}
          >
            Import Data
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
};
