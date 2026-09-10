import { useEffect } from "react";
import { Control, Controller, UseFormSetValue, UseFormWatch } from "react-hook-form";
import { FormatOptionLabelMeta, SingleValue } from "react-select";
import { BotIcon, InfoIcon } from "lucide-react";

import { AppConnectionOption } from "@app/components/app-connections";
import {
  Badge,
  DocumentationLinkBadge,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FilterableSelect,
  OrgIcon,
  SubOrgIcon
} from "@app/components/v3";
import {
  ProjectPermissionSub,
  useOrganization,
  useProject,
  useProjectPermission
} from "@app/context";
import { ProjectPermissionAppConnectionActions } from "@app/context/ProjectPermissionContext/types";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import { EXTERNAL_APPROVAL_DESCRIPTIONS } from "@app/helpers/externalApprovals";
import { usePopUp } from "@app/hooks";
import {
  useGetExternalApprovalApproverIdentities,
  useGetExternalApprovalOptions
} from "@app/hooks/api";
import {
  ExternalApprovalType,
  TExternalApprovalApproverIdentity,
  TExternalApprovalOption
} from "@app/hooks/api/accessApproval/types";
import { useListAvailableAppConnections } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { AddAppConnectionModal } from "@app/pages/organization/AppConnections/AppConnectionsPage/components";

import { TApprovalPolicyFormSchema } from "./approvalPolicyFormSchema";

const CREATE_CONNECTION_ID = "_create";
const SERVICENOW_DOCS_URL = "https://infisical.com/docs/integrations/app-connections/servicenow";

const formatProviderOptionLabel = (
  option: TExternalApprovalOption,
  { context }: FormatOptionLabelMeta<TExternalApprovalOption>
) => {
  if (context === "value") return option.name;

  return (
    <div className="flex items-center gap-2.5">
      <img
        alt={`${option.name} logo`}
        src={`/images/integrations/${APP_CONNECTION_MAP[option.app].image}`}
        className="size-5 shrink-0 rounded"
      />
      <div className="min-w-0">
        <p className="truncate">{option.name}</p>
        <p className="truncate text-xs text-muted">{EXTERNAL_APPROVAL_DESCRIPTIONS[option.type]}</p>
      </div>
    </div>
  );
};

const IdentityScopeBadge = ({ identity }: { identity: TExternalApprovalApproverIdentity }) => {
  const { currentOrg, isSubOrganization } = useOrganization();

  if (isSubOrganization && currentOrg.id === identity.orgId)
    return (
      <Badge variant="sub-org">
        <SubOrgIcon />
        Sub-Organization
      </Badge>
    );

  return (
    <Badge variant="org">
      <OrgIcon />
      Organization
    </Badge>
  );
};

const formatIdentityOptionLabel = (
  option: TExternalApprovalApproverIdentity,
  { context }: FormatOptionLabelMeta<TExternalApprovalApproverIdentity>
) => (
  <div className="flex min-w-0 items-center gap-2">
    <BotIcon className="size-3.5 shrink-0 text-muted" />
    <span className="truncate">{option.name}</span>
    {context === "menu" && (
      <div className="ml-auto shrink-0">
        <IdentityScopeBadge identity={option} />
      </div>
    )}
  </div>
);

type Props = {
  control: Control<TApprovalPolicyFormSchema>;
  watch: UseFormWatch<TApprovalPolicyFormSchema>;
  setValue: UseFormSetValue<TApprovalPolicyFormSchema>;
};

export const ExternalApprovalFields = ({ control, watch, setValue }: Props) => {
  const { currentProject } = useProject();
  const { permission } = useProjectPermission();
  const { popUp, handlePopUpToggle, handlePopUpOpen } = usePopUp(["addConnection"] as const);

  const externalType = watch("externalApproval.type");

  const { data: externalApprovalOptions = [], isPending: isOptionsPending } =
    useGetExternalApprovalOptions();

  const selectedProvider = externalApprovalOptions.find((option) => option.type === externalType);
  const app = selectedProvider?.app;
  const appName = selectedProvider?.name ?? "";

  // the hook needs an app even while the query is disabled; nothing is fetched until a provider is picked
  const { data: availableConnections = [], isPending: isConnectionsPending } =
    useListAvailableAppConnections(app ?? AppConnection.ServiceNow, currentProject.id, {
      enabled: Boolean(app)
    });

  const { data: identities = [], isPending: isIdentitiesPending } =
    useGetExternalApprovalApproverIdentities({
      projectId: currentProject.id,
      options: { enabled: Boolean(externalType) }
    });

  const canCreateConnection = permission.can(
    ProjectPermissionAppConnectionActions.Create,
    ProjectPermissionSub.AppConnections
  );

  const approverIdentityId = watch("externalApproval.approverIdentityId");

  useEffect(() => {
    if (isIdentitiesPending || !approverIdentityId) return;
    if (identities.some((identity) => identity.id === approverIdentityId)) return;

    setValue("externalApproval.approverIdentityId", undefined);
  }, [isIdentitiesPending, approverIdentityId, identities]);

  return (
    <div className="flex flex-col gap-4">
      <Controller
        control={control}
        name="externalApproval.type"
        defaultValue={ExternalApprovalType.ServiceNow}
        render={({ field: { onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>
              External Provider <span className="text-danger">*</span>
            </FieldLabel>
            <FieldContent>
              <FilterableSelect
                value={selectedProvider ?? null}
                onChange={(newValue) => {
                  onChange((newValue as SingleValue<TExternalApprovalOption>)?.type);
                  setValue("externalApproval.connectionId", undefined, { shouldDirty: true });
                }}
                options={externalApprovalOptions}
                isLoading={isOptionsPending}
                placeholder="Select an external provider..."
                getOptionValue={(option) => option.type}
                getOptionLabel={(option) => option.name}
                formatOptionLabel={formatProviderOptionLabel}
                isError={Boolean(error)}
              />
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
      <Controller
        control={control}
        name="externalApproval.connectionId"
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <div className="flex items-center justify-between gap-3">
              <FieldLabel>
                App Connection <span className="text-danger">*</span>
              </FieldLabel>
              <DocumentationLinkBadge href={SERVICENOW_DOCS_URL} />
            </div>
            <FieldContent>
              <FilterableSelect
                value={availableConnections.find((connection) => connection.id === value) ?? null}
                onChange={(newValue) => {
                  const selected = newValue as SingleValue<{ id: string; name: string }>;

                  if (selected?.id === CREATE_CONNECTION_ID) {
                    handlePopUpOpen("addConnection");
                    return;
                  }

                  onChange(selected?.id);
                }}
                options={[
                  ...(canCreateConnection
                    ? [{ id: CREATE_CONNECTION_ID, name: "Create Connection" }]
                    : []),
                  ...availableConnections
                ]}
                isDisabled={!app}
                isLoading={Boolean(app) && isConnectionsPending}
                placeholder={app ? "Select an app connection..." : "Select a provider first"}
                getOptionValue={(option) => option.id}
                getOptionLabel={(option) => option.name}
                components={{ Option: AppConnectionOption }}
                isError={Boolean(error)}
              />
              <FieldDescription>
                Infisical uses this connection to open and track change requests.
              </FieldDescription>
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
      {Boolean(app) && !isConnectionsPending && !availableConnections.length && (
        <p className="flex items-center gap-1.5 text-xs text-warning">
          <InfoIcon className="size-3.5 shrink-0" />
          You do not have access to any {appName} Connections. Contact an admin to create one.
        </p>
      )}
      <Controller
        control={control}
        name="externalApproval.approverIdentityId"
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>
              Approving Identity <span className="text-danger">*</span>
            </FieldLabel>
            <FieldContent>
              <FilterableSelect
                value={identities.find((identity) => identity.id === value) ?? null}
                onChange={(newValue) => onChange((newValue as SingleValue<{ id: string }>)?.id)}
                options={identities}
                isDisabled={!externalType}
                isLoading={Boolean(externalType) && isIdentitiesPending}
                placeholder={
                  externalType
                    ? "Select an approving machine identity..."
                    : "Select a provider first"
                }
                getOptionValue={(option) => option.id}
                getOptionLabel={(option) => option.name}
                formatOptionLabel={formatIdentityOptionLabel}
                isError={Boolean(error)}
              />
              <FieldDescription>
                Only this identity can approve requests under this policy.
              </FieldDescription>
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
      {Boolean(externalType) && !isIdentitiesPending && !identities.length && (
        <p className="flex items-center gap-1.5 text-xs text-warning">
          <InfoIcon className="size-3.5 shrink-0" />
          No machine identity can report approval decisions. Grant one the Review permission on
          External Approvals through an organization role.
        </p>
      )}
      <AddAppConnectionModal
        isOpen={popUp.addConnection.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("addConnection", isOpen)}
        projectType={currentProject.type}
        projectId={currentProject.id}
        app={app}
        onComplete={(connection) => {
          if (!connection) return;

          setValue("externalApproval.connectionId", connection.id, {
            shouldDirty: true,
            shouldValidate: true
          });
        }}
      />
    </div>
  );
};
