import { useEffect, useMemo, useRef, useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { FormatOptionLabelMeta, MultiValue, SingleValue } from "react-select";
import { Info, TriangleAlert } from "lucide-react";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
  FilterableSelect,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { GCP_SYNC_SCOPES } from "@app/helpers/secretSyncs";
import {
  useGcpConnectionListProjectLocations,
  useGcpConnectionListProjects
} from "@app/hooks/api/appConnections/gcp/queries";
import { TGcpLocation, TGcpProject } from "@app/hooks/api/appConnections/gcp/types";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { GcpSyncScope } from "@app/hooks/api/secretSyncs/types/gcp-sync";

import { TSecretSyncForm } from "../schemas";

// The control renders selected values inside chips (isMulti), where a nested Badge reads as a
// badge-in-badge; use plain parentheses there and keep the Badge for menu options.
const formatOptionLabel = (
  { displayName, locationId }: TGcpLocation,
  { context }: FormatOptionLabelMeta<TGcpLocation>
) =>
  context === "value" ? (
    <span>
      {displayName} ({locationId})
    </span>
  ) : (
    <div className="flex w-full flex-row items-center gap-1">
      <span>{displayName}</span> <Badge variant="info">{locationId}</Badge>
    </div>
  );

const ADVANCED_ITEM_VALUE = "gcp-secret-manager-advanced";

export const GcpSyncFields = () => {
  const { control, setValue, formState } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.GCPSecretManager }
  >();

  const connectionId = useWatch({ name: "connection.id", control });
  const projectId = useWatch({ name: "destinationConfig.projectId", control });
  const selectedScope = useWatch({ name: "destinationConfig.scope", control });
  const locationId = useWatch({ name: "destinationConfig.locationId", control });
  const userReplicaLocationIds = useWatch({
    name: "destinationConfig.userReplicaLocationIds",
    control
  });

  // Replica regions are immutable on GCP once the secret is created. When editing an existing
  // Global-scope sync that already committed replica regions, lock the field (values come from
  // the saved record, populated only in the edit form).
  const defaultConfig = formState.defaultValues?.destinationConfig;
  const committedReplicaLocationIds = useMemo(() => {
    if (defaultConfig?.scope !== GcpSyncScope.Global) return [];
    return (
      (defaultConfig as { userReplicaLocationIds?: (string | undefined)[] })
        .userReplicaLocationIds ?? []
    ).filter((id): id is string => Boolean(id));
  }, [defaultConfig]);
  const isGlobalScope = selectedScope === GcpSyncScope.Global;
  const isCommittedGlobalSync = committedReplicaLocationIds.length > 0;
  const lockReplicaRegions = isCommittedGlobalSync && isGlobalScope;

  // locationId counts as configured: legacy Global syncs store their replica region there, and it
  // is seeded into userReplicaLocationIds after mount, too late for the accordion's initial state.
  const hasConfiguredReplicaRegions =
    isGlobalScope && ((userReplicaLocationIds?.length ?? 0) > 0 || Boolean(locationId));
  const hasAccordionError = Boolean(
    formState.errors.destinationConfig &&
      "userReplicaLocationIds" in formState.errors.destinationConfig
  );

  const [openItem, setOpenItem] = useState<string>(
    hasConfiguredReplicaRegions || hasAccordionError ? ADVANCED_ITEM_VALUE : ""
  );

  // The accordion content clips its children (overflow-hidden for the height animation), so the
  // select menu is portaled to the enclosing sheet. The ref must sit on a plain, always-mounted
  // element: v3 components don't forward refs on React 18, and the accordion content only exists
  // in the DOM while open.
  const containerRef = useRef<HTMLDivElement>(null);
  const [menuPortalTarget, setMenuPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setMenuPortalTarget(containerRef.current?.closest<HTMLElement>('[role="dialog"]') ?? null);
  }, []);

  useEffect(() => {
    if (hasAccordionError) setOpenItem(ADVANCED_ITEM_VALUE);
  }, [hasAccordionError, formState.submitCount]);

  const { data: projects, isPending } = useGcpConnectionListProjects(connectionId, {
    enabled: Boolean(connectionId)
  });

  const { data: locations, isPending: areLocationsPending } = useGcpConnectionListProjectLocations(
    { connectionId, projectId },
    {
      enabled: Boolean(connectionId) && Boolean(projectId)
    }
  );

  useEffect(() => {
    if (!selectedScope) setValue("destinationConfig.scope", GcpSyncScope.Global);
  }, []);

  useEffect(() => {
    if (selectedScope === GcpSyncScope.Global && locationId && !userReplicaLocationIds?.length) {
      setValue("destinationConfig.userReplicaLocationIds", [locationId], {
        shouldDirty: false
      });
    }
  }, []);

  useEffect(() => {
    if (isCommittedGlobalSync && isGlobalScope && !userReplicaLocationIds?.length) {
      setValue("destinationConfig.userReplicaLocationIds", committedReplicaLocationIds, {
        shouldDirty: false
      });
    }
  }, [
    isCommittedGlobalSync,
    isGlobalScope,
    userReplicaLocationIds,
    committedReplicaLocationIds,
    setValue
  ]);

  return (
    <div ref={containerRef} className="contents">
      <FieldGroup className="min-h-0 flex-1">
        <SecretSyncConnectionField
          onChange={() => {
            setValue("destinationConfig.projectId", "");
            setValue("destinationConfig.locationId", "");
            setValue("destinationConfig.userReplicaLocationIds", []);
          }}
        />
        <Controller
          name="destinationConfig.projectId"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field>
              <FieldLabel>
                Project
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-md">
                    Ensure that you&apos;ve enabled the Secret Manager API, Cloud Resource Manager
                    API, and Service Usage API on your GCP project. Additionally, make sure that the
                    service account is assigned the appropriate GCP roles.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <FieldContent>
                <FilterableSelect
                  isLoading={isPending && Boolean(connectionId)}
                  isDisabled={!connectionId}
                  value={projects?.find((project) => project.id === value) ?? null}
                  onChange={(option) => {
                    setValue("destinationConfig.locationId", "");
                    setValue("destinationConfig.userReplicaLocationIds", []);
                    onChange((option as SingleValue<TGcpProject>)?.id ?? null);
                  }}
                  options={projects}
                  placeholder="Select a GCP project..."
                  getOptionLabel={(option) => option.name}
                  getOptionValue={(option) => option.id.toString()}
                />
                <FieldError errors={[error]} />
              </FieldContent>
            </Field>
          )}
        />
        <Controller
          name="destinationConfig.scope"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field>
              <FieldLabel>
                Scope
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-lg">
                    <div className="flex flex-col gap-3">
                      <p>
                        Specify how Infisical should sync secrets to GCP. The following options are
                        available:
                      </p>
                      <ul className="flex list-disc flex-col gap-3 pl-4">
                        {Object.values(GCP_SYNC_SCOPES).map(({ name, description }) => (
                          <li key={name}>
                            <p className="text-label">
                              <span className="font-medium text-foreground">{name}</span>:{" "}
                              {description}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <FieldContent>
                <Select
                  value={value}
                  onValueChange={(val) => {
                    onChange(val);
                    setValue("destinationConfig.locationId", "");
                    setValue("destinationConfig.userReplicaLocationIds", []);
                  }}
                  disabled={!projectId}
                >
                  <SelectTrigger className="w-full capitalize" isError={Boolean(error)}>
                    <SelectValue placeholder="Select a scope..." />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {Object.values(GcpSyncScope).map((scope) => (
                      <SelectItem className="capitalize" value={scope} key={scope}>
                        {scope}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError errors={[error]} />
              </FieldContent>
            </Field>
          )}
        />
        {selectedScope === GcpSyncScope.Region && (
          <Controller
            name="destinationConfig.locationId"
            control={control}
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <Field>
                <FieldLabel>Region</FieldLabel>
                <FieldContent>
                  <FilterableSelect
                    isLoading={areLocationsPending && Boolean(projectId)}
                    isDisabled={!projectId}
                    value={locations?.find((option) => option.locationId === value) ?? null}
                    onChange={(option) =>
                      onChange((option as SingleValue<TGcpLocation>)?.locationId ?? "")
                    }
                    options={locations}
                    placeholder="Select a region..."
                    getOptionValue={(option) => option.locationId}
                    formatOptionLabel={formatOptionLabel}
                  />
                  <FieldError errors={[error]} />
                </FieldContent>
              </Field>
            )}
          />
        )}
        {selectedScope === GcpSyncScope.Global && (
          <Accordion
            type="single"
            collapsible
            variant="ghost"
            value={openItem}
            onValueChange={setOpenItem}
            className="flex min-h-0 flex-1 flex-col"
          >
            <AccordionItem
              value={ADVANCED_ITEM_VALUE}
              className="flex min-h-0 flex-1 flex-col [&>[data-slot=accordion-content]]:flex [&>[data-slot=accordion-content]]:min-h-0 [&>[data-slot=accordion-content]]:flex-1 [&>[data-slot=accordion-content]]:flex-col"
            >
              <AccordionTrigger>Advanced</AccordionTrigger>
              <AccordionContent>
                <Controller
                  name="destinationConfig.userReplicaLocationIds"
                  control={control}
                  render={({ field: { value, onChange }, fieldState: { error } }) => (
                    <Field>
                      <FieldLabel>
                        Replica Regions
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-md">
                            When set, secrets are replicated only in the selected regions. When
                            empty, GCP automatically manages replication.
                          </TooltipContent>
                        </Tooltip>
                      </FieldLabel>
                      <FieldContent>
                        <FilterableSelect
                          isMulti
                          isLoading={areLocationsPending && Boolean(projectId)}
                          isDisabled={!projectId || lockReplicaRegions}
                          isClearable={!lockReplicaRegions}
                          value={
                            locations?.filter((option) =>
                              (value || []).includes(option.locationId)
                            ) ?? []
                          }
                          onChange={(option) =>
                            onChange((option as MultiValue<TGcpLocation>).map((o) => o.locationId))
                          }
                          options={locations}
                          placeholder="Automatic replication"
                          getOptionValue={(option) => option.locationId}
                          formatOptionLabel={formatOptionLabel}
                          menuPortalTarget={menuPortalTarget ?? undefined}
                          menuPosition="fixed"
                          menuPlacement="auto"
                        />

                        {(value?.length ?? 0) > 0 && (
                          <Alert variant="warning" className="mt-2">
                            <TriangleAlert />
                            <AlertTitle>
                              Replica regions can&apos;t be changed after creation
                            </AlertTitle>
                            <AlertDescription>
                              <p>
                                Replica regions are fixed when the sync is created and cannot be
                                changed later, since GCP does not support it. It is still possible
                                to change the scope to <span className="font-medium">Region</span>{" "}
                                and specify a region for the secret.
                              </p>
                            </AlertDescription>
                          </Alert>
                        )}
                        <FieldError errors={[error]} />
                      </FieldContent>
                    </Field>
                  )}
                />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
      </FieldGroup>
    </div>
  );
};
