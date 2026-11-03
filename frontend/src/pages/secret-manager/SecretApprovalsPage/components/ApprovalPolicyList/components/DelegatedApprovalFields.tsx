import { useState } from "react";
import { Control, Controller, UseFormSetValue, UseFormWatch } from "react-hook-form";
import { InfoIcon } from "lucide-react";

import { AppConnectionOptionContent } from "@app/components/app-connections";
import { useConnectionCreation } from "@app/components/app-connections/useConnectionCreation";
import {
  EnterpriseAppConnectionsUpgradeIntent,
  UpgradeGate
} from "@app/components/license/UpgradeGate";
import {
  Combobox,
  DocumentationLinkBadge,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator
} from "@app/components/v3";
import { useProject, useSubscription } from "@app/context";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import { DELEGATED_APPROVAL_DOCS_MAP } from "@app/helpers/delegatedApprovals";
import { useListAvailableAppConnections } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import {
  DelegatedApprovalPolicyType,
  TDelegatedApprovalOption,
  useDelegatedApprovalOptions
} from "@app/hooks/api/delegatedApprovals";

import { TApprovalPolicyFormSchema } from "./approvalPolicyFormSchema";

type Props = {
  control: Control<TApprovalPolicyFormSchema>;
  watch: UseFormWatch<TApprovalPolicyFormSchema>;
  setValue: UseFormSetValue<TApprovalPolicyFormSchema>;
};

type ConnectionFieldProps = Pick<Props, "control" | "setValue"> & {
  app: AppConnection;
  providerName: string;
};

const DelegatedApprovalConnectionField = ({
  control,
  setValue,
  app,
  providerName
}: ConnectionFieldProps) => {
  const { currentProject } = useProject();
  const { data: connections = [], isPending } = useListAvailableAppConnections(
    app,
    currentProject.id
  );
  const connectionCreation = useConnectionCreation(app, (connection) => {
    setValue("delegatedApproval.connectionId", connection.id, {
      shouldDirty: true,
      shouldValidate: true
    });
  });

  return (
    <Controller
      control={control}
      name="delegatedApproval.connectionId"
      render={({ field: { value, onChange }, fieldState: { error } }) => (
        <>
          <Combobox
            modal
            isClearable={false}
            aria-label="App connection"
            isLoading={isPending}
            isError={Boolean(error)}
            value={connections.find((connection) => connection.id === value) ?? null}
            onValueChange={(connection) => onChange(connection.id)}
            options={connections}
            placeholder="Select an app connection..."
            getOptionLabel={(connection) => connection.name}
            getOptionValue={(connection) => connection.id}
            renderOption={(connection) => <AppConnectionOptionContent data={connection} />}
            creation={connectionCreation}
          />
          {value && (
            <FieldDescription>
              Infisical uses this connection to send requests to {providerName}.
            </FieldDescription>
          )}
          {!isPending && !connections.length && !connectionCreation && (
            <p className="flex items-center gap-1.5 text-xs text-warning">
              <InfoIcon className="size-3.5 shrink-0" />
              You do not have access to any {APP_CONNECTION_MAP[app].name} Connections. Contact an
              admin to create one.
            </p>
          )}
          <FieldError errors={[error]} />
        </>
      )}
    />
  );
};

export const DelegatedApprovalFields = ({ control, watch, setValue }: Props) => {
  const { subscription } = useSubscription();
  const [isUpgradeGateOpen, setIsUpgradeGateOpen] = useState(false);
  const { data: options = [], isPending: isOptionsPending } = useDelegatedApprovalOptions();

  const selectedType = watch("delegatedApproval.type");
  const selectedOption = options.find((option) => option.type === selectedType);

  const handleProviderChange = (
    option: TDelegatedApprovalOption | undefined,
    onChange: (type: DelegatedApprovalPolicyType) => void
  ) => {
    if (!option) return;

    if (
      APP_CONNECTION_MAP[option.connection].enterprise &&
      !subscription.enterpriseAppConnections
    ) {
      setIsUpgradeGateOpen(true);
      return;
    }

    onChange(option.type);
    setValue("delegatedApproval.connectionId", undefined, { shouldDirty: true });
  };

  return (
    <div className="flex flex-col gap-4">
      <Controller
        control={control}
        name="delegatedApproval.type"
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>
              Provider <span className="text-danger">*</span>
            </FieldLabel>
            <FieldContent>
              <Select
                value={value ?? ""}
                disabled={isOptionsPending}
                onValueChange={(type) =>
                  handleProviderChange(
                    options.find((option) => option.type === type),
                    onChange
                  )
                }
              >
                <SelectTrigger aria-label="Provider" className="w-full" isError={Boolean(error)}>
                  <SelectValue placeholder="Select a provider..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {options.map((option) => (
                    <SelectItem key={option.type} value={option.type}>
                      <span className="flex items-center gap-2">
                        <img
                          alt=""
                          src={`/images/integrations/${APP_CONNECTION_MAP[option.connection].image}`}
                          className="size-4 shrink-0 rounded-sm"
                        />
                        {option.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
      <Field>
        <div className="flex items-center justify-between gap-3">
          <FieldLabel>
            App Connection <span className="text-danger">*</span>
          </FieldLabel>
          {selectedOption && (
            <DocumentationLinkBadge
              href={DELEGATED_APPROVAL_DOCS_MAP[selectedOption.type].connection}
            />
          )}
        </div>
        <FieldContent>
          {selectedOption ? (
            <DelegatedApprovalConnectionField
              key={selectedOption.type}
              control={control}
              setValue={setValue}
              app={selectedOption.connection}
              providerName={selectedOption.name}
            />
          ) : (
            <>
              <Combobox
                isDisabled
                isClearable={false}
                aria-label="App connection"
                value={null}
                onValueChange={() => {}}
                options={[]}
                placeholder="Select an app connection..."
                getOptionLabel={() => ""}
                getOptionValue={() => ""}
              />
              <FieldDescription>Select a provider first.</FieldDescription>
            </>
          )}
        </FieldContent>
      </Field>
      {selectedOption && (
        <>
          <Separator />
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-foreground">{selectedOption.name} Setup</p>
              <DocumentationLinkBadge
                href={DELEGATED_APPROVAL_DOCS_MAP[selectedOption.type].setup}
              />
            </div>
            <p className="text-xs text-muted">
              {selectedOption.name} must be configured in order to act as an external approval
              system. Ensure that you have installed the Infisical {selectedOption.name} App before
              you continue.
            </p>
          </div>
        </>
      )}
      <UpgradeGate
        paywallKey="secret-manager.approval-policy-external-approval"
        isOpen={isUpgradeGateOpen}
        onOpenChange={setIsUpgradeGateOpen}
        intent={EnterpriseAppConnectionsUpgradeIntent}
      />
    </div>
  );
};
