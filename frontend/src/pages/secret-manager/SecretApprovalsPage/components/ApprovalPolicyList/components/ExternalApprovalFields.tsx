import { Control, Controller, UseFormSetValue, UseFormWatch } from "react-hook-form";
import { FormatOptionLabelMeta, SingleValue } from "react-select";
import { InfoIcon } from "lucide-react";

import { AppConnectionOption } from "@app/components/app-connections";
import {
  DocumentationLinkBadge,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FilterableSelect
} from "@app/components/v3";
import {
  ProjectPermissionSub,
  useOrganization,
  useProject,
  useProjectPermission
} from "@app/context";
import { ProjectPermissionAppConnectionActions } from "@app/context/ProjectPermissionContext/types";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import {
  EXTERNAL_APPROVAL_TYPE_MAP,
  EXTERNAL_APPROVAL_TYPES
} from "@app/helpers/externalApprovals";
import { usePopUp } from "@app/hooks";
import { useGetIdentityMembershipOrgs } from "@app/hooks/api";
import { ExternalApprovalType } from "@app/hooks/api/accessApproval/types";
import { useListAvailableAppConnections } from "@app/hooks/api/appConnections";
import { AddAppConnectionModal } from "@app/pages/organization/AppConnections/AppConnectionsPage/components";

import { TApprovalPolicyFormSchema } from "./approvalPolicyFormSchema";

const CREATE_CONNECTION_ID = "_create";
const SERVICENOW_DOCS_URL = "https://infisical.com/docs/integrations/app-connections/servicenow";

const formatProviderOptionLabel = (
  option: ExternalApprovalType,
  { context }: FormatOptionLabelMeta<ExternalApprovalType>
) => {
  const details = EXTERNAL_APPROVAL_TYPE_MAP[option];

  if (context === "value") return details.name;

  return (
    <div className="flex items-center gap-2.5">
      <img
        alt={`${details.name} logo`}
        src={`/images/integrations/${APP_CONNECTION_MAP[details.app].image}`}
        className="size-5 shrink-0 rounded"
      />
      <div className="min-w-0">
        <p className="truncate">{details.name}</p>
        <p className="truncate text-xs text-muted">{details.description}</p>
      </div>
    </div>
  );
};

type Props = {
  control: Control<TApprovalPolicyFormSchema>;
  watch: UseFormWatch<TApprovalPolicyFormSchema>;
  setValue: UseFormSetValue<TApprovalPolicyFormSchema>;
};

export const ExternalApprovalFields = ({ control, watch, setValue }: Props) => {
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const { permission } = useProjectPermission();
  const { popUp, handlePopUpToggle, handlePopUpOpen } = usePopUp(["addConnection"] as const);

  const externalType = watch("externalApproval.type");
  const connectionId = watch("externalApproval.connectionId");

  const providerDetails = externalType ? EXTERNAL_APPROVAL_TYPE_MAP[externalType] : undefined;
  const app = providerDetails?.app;
  const appName = app ? APP_CONNECTION_MAP[app].name : "";

  const { data: availableConnections = [], isPending: isConnectionsPending } =
    useListAvailableAppConnections(
      app ?? EXTERNAL_APPROVAL_TYPE_MAP[ExternalApprovalType.ServiceNow].app,
      currentProject.id,
      { enabled: Boolean(app) }
    );

  const { data: identityData, isPending: isIdentitiesPending } = useGetIdentityMembershipOrgs(
    { organizationId: currentOrg.id, limit: 100 },
    { enabled: Boolean(connectionId) }
  );

  const identities = identityData?.identityMemberships.map(({ identity }) => identity) ?? [];

  const canCreateConnection = permission.can(
    ProjectPermissionAppConnectionActions.Create,
    ProjectPermissionSub.AppConnections
  );

  const clearApproverIdentity = () =>
    setValue("externalApproval.approverIdentityId", undefined, { shouldDirty: true });

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-popover p-4">
      <Controller
        control={control}
        name="externalApproval.type"
        defaultValue={ExternalApprovalType.ServiceNow}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>
              External Provider <span className="text-danger">*</span>
            </FieldLabel>
            <FieldContent>
              <FilterableSelect
                value={value ?? null}
                onChange={(newValue) => {
                  onChange(newValue as SingleValue<ExternalApprovalType>);
                  setValue("externalApproval.connectionId", undefined, { shouldDirty: true });
                  clearApproverIdentity();
                }}
                options={EXTERNAL_APPROVAL_TYPES}
                placeholder="Select an external provider..."
                getOptionValue={(option) => option}
                getOptionLabel={(option) => EXTERNAL_APPROVAL_TYPE_MAP[option].name}
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
                  clearApproverIdentity();
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
                isDisabled={!connectionId}
                isLoading={Boolean(connectionId) && isIdentitiesPending}
                placeholder={
                  connectionId
                    ? "Select an approving machine identity..."
                    : "Select an app connection first"
                }
                getOptionValue={(option) => option.id}
                getOptionLabel={(option) => option.name}
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
          clearApproverIdentity();
        }}
      />
    </div>
  );
};
