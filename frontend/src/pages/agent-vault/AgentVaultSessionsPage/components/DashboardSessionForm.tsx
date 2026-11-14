import { useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "@tanstack/react-router";
import { TriangleAlertIcon } from "lucide-react";
import ms from "ms";
import { z } from "zod";

import { PersonalValuesDialog } from "@app/components/agent-vault/PersonalValuesDialog";
import { hostPatternOf } from "@app/components/agent-vault/service-sheet/serviceSchema";
import { ServiceIcon } from "@app/components/agent-vault/ServiceIconStack";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Combobox,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import { useDebounce } from "@app/hooks";
import { useGetAgentVaultAccessBundle, useListAgentVaultServices } from "@app/hooks/api/agentVault";
import {
  TAgentVaultAccessBundleListItem,
  TAgentVaultProjectService,
  TAgentVaultService
} from "@app/hooks/api/agentVault/types";

import { sessionLabelSchema } from "./sessionLabelSchema";

const NEVER_TTL = "never";
const CUSTOM_TTL = "custom";

const TTL_PRESETS = [
  { value: "1h", label: "1 hour" },
  { value: "8h", label: "8 hours" },
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
  { value: NEVER_TTL, label: "Never" },
  { value: CUSTOM_TTL, label: "Custom" }
];
const DEFAULT_TTL_PRESET = "7d";

// The most of the project's services the API takes on one session.
const MAX_NAMED_SERVICES = 50;
const SERVICE_PICKER_LIMIT = 50;

const MIN_TTL_MS = 60 * 1000;
// Mirrors the API's ceiling: past it the expiry overflows and the request fails with a 500.
const MAX_TTL_MS = 100 * 365 * 24 * 60 * 60 * 1000;

const getCustomTtlError = (value: string) => {
  let parsed: number | undefined;
  try {
    parsed = ms(value.trim() as Parameters<typeof ms>[0]);
  } catch {
    parsed = undefined;
  }

  if (typeof parsed !== "number" || Number.isNaN(parsed)) return "Not a valid duration.";
  if (parsed < MIN_TTL_MS) return "At least 1 minute.";
  if (parsed > MAX_TTL_MS) return "At most 100 years. Pick Never for no expiry.";
  return null;
};

const schema = z
  .object({
    services: z.custom<TAgentVaultProjectService[]>(),
    label: sessionLabelSchema,
    ttlPreset: z.string(),
    customTtl: z.string()
  })
  .superRefine((data, ctx) => {
    if (data.services.length > MAX_NAMED_SERVICES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["services"],
        message: `A session can name up to ${MAX_NAMED_SERVICES} services. Remove ${
          data.services.length - MAX_NAMED_SERVICES
        } to continue.`
      });
    }
    if (data.ttlPreset === CUSTOM_TTL) {
      const error = getCustomTtlError(data.customTtl);
      if (error) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["customTtl"], message: error });
    }
  });

type FormData = z.infer<typeof schema>;

export type TDashboardSessionInput = { label?: string; ttl: string; services: string[] };

type Props = {
  formId: string;
  accessBundle: TAgentVaultAccessBundleListItem | null;
  onSubmit: (input: TDashboardSessionInput) => Promise<void>;
};

export const DashboardSessionForm = ({ formId, accessBundle, onSubmit }: Props) => {
  const { projectId } = useProject();
  const { currentOrg } = useOrganization();

  const { control, handleSubmit, watch, setError } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { services: [], label: "", ttlPreset: DEFAULT_TTL_PRESET, customTtl: "" }
  });
  const ttlPreset = watch("ttlPreset");
  const selectedServices = watch("services");

  // An admin can name any of the project's services, and a member only those in their bundles, which is what this
  // list returns to each.
  const [serviceSearch, setServiceSearch] = useState("");
  const [debouncedServiceSearch] = useDebounce(serviceSearch);
  const { data: nameableServices, isFetching: isSearchingServices } = useListAgentVaultServices(
    projectId,
    {
      search: debouncedServiceSearch.trim() || undefined,
      orderBy: "name",
      orderDirection: "asc",
      limit: SERVICE_PICKER_LIMIT
    }
  );

  const { data: bundleDetails } = useGetAgentVaultAccessBundle(projectId, accessBundle?.id ?? "");
  // Read again rather than taken from the picked options, so values set up from this dialog clear the warning.
  const { data: servicesRequiringSetup } = useListAgentVaultServices(
    projectId,
    { requiresSetup: true, limit: 100 },
    { enabled: selectedServices.length > 0 }
  );
  const bundleNeedsSetup =
    accessBundle && bundleDetails?.id === accessBundle.id
      ? bundleDetails.services.filter(
          (service) => service.personalValues && !service.personalValues.isConfigured
        )
      : [];
  const pickedIds = new Set(selectedServices.map((service) => service.id));
  // A picked service can be in the bundle too, so each is listed once.
  const pickedNeedsSetup = (servicesRequiringSetup?.services ?? []).filter(
    (service) =>
      pickedIds.has(service.id) && !bundleNeedsSetup.some((other) => other.id === service.id)
  );
  const needsSetup = [...bundleNeedsSetup, ...pickedNeedsSetup];
  // Past four, three are listed and the rest link to where every one is: the bundle's table, or with picked services
  // among them, the Services page filtered to the ones that need setting up.
  const shownNeedsSetup = needsSetup.length > 4 ? needsSetup.slice(0, 3) : needsSetup;
  const hiddenNeedsSetupCount = needsSetup.length - shownNeedsSetup.length;
  const [serviceToSetUp, setServiceToSetUp] = useState<TAgentVaultService | null>(null);
  const customTtlInputRef = useRef<HTMLInputElement | null>(null);
  const shouldFocusCustomTtlRef = useRef(false);

  return (
    <form
      id={formId}
      onSubmit={handleSubmit(({ services, label, ttlPreset: preset, customTtl }) => {
        // The bundle is picked outside this form, so this check can't live in the schema.
        if (!accessBundle && !services.length) {
          setError("services", { message: "Pick an access bundle or at least one service." });
          return undefined;
        }
        return onSubmit({
          services: services.map((service) => service.name),
          label: label || undefined,
          ttl: preset === CUSTOM_TTL ? customTtl.trim() : preset
        });
      })}
      className="flex flex-col gap-4"
    >
      <Controller
        control={control}
        name="services"
        render={({ field, fieldState }) => (
          <Field>
            <FieldLabel htmlFor="agent-vault-session-services">Services</FieldLabel>
            <FieldContent>
              <Combobox<TAgentVaultProjectService>
                id="agent-vault-session-services"
                multiple
                options={nameableServices?.services ?? []}
                value={field.value}
                isLoading={isSearchingServices}
                onSearchChange={setServiceSearch}
                includeMissingSelectedOptions
                getOptionValue={(service) => service.id}
                getOptionLabel={(service) => service.name}
                renderOption={(service) => (
                  <div className="flex min-w-0 items-center gap-2">
                    <ServiceIcon hostPattern={hostPatternOf(service)} serviceType={service.type} />
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm">{service.name}</span>
                      {service.description && (
                        <span className="truncate text-xs text-muted">{service.description}</span>
                      )}
                    </div>
                  </div>
                )}
                placeholder="Pick services"
                searchAriaLabel="Search services"
                emptyMessage={
                  serviceSearch ? "No services match your search" : "No services you can use yet"
                }
                modal
                isError={Boolean(fieldState.error)}
                onValueChange={field.onChange}
              />
              <FieldDescription>
                The project&apos;s services this session reaches, beside or instead of an access
                bundle.
              </FieldDescription>
              <FieldError>{fieldState.error?.message}</FieldError>
            </FieldContent>
          </Field>
        )}
      />
      <Controller
        control={control}
        name="label"
        render={({ field, fieldState }) => (
          <Field>
            <FieldLabel htmlFor="agent-vault-session-label">
              Label <span className="text-muted">(optional)</span>
            </FieldLabel>
            <FieldContent>
              <Input
                {...field}
                id="agent-vault-session-label"
                placeholder="Nightly deploy"
                isError={Boolean(fieldState.error)}
              />
              <FieldDescription>Describes what this session is for.</FieldDescription>
              <FieldError>{fieldState.error?.message}</FieldError>
            </FieldContent>
          </Field>
        )}
      />

      <Field>
        <FieldLabel>Expires</FieldLabel>
        <FieldContent>
          <Controller
            control={control}
            name="ttlPreset"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={(value) => {
                  shouldFocusCustomTtlRef.current = value === CUSTOM_TTL;
                  field.onChange(value);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent
                  position="popper"
                  onCloseAutoFocus={(e) => {
                    if (!shouldFocusCustomTtlRef.current) return;
                    shouldFocusCustomTtlRef.current = false;
                    e.preventDefault();
                    customTtlInputRef.current?.focus();
                  }}
                >
                  {TTL_PRESETS.map((preset) => (
                    <SelectItem key={preset.value} value={preset.value}>
                      {preset.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {ttlPreset === CUSTOM_TTL && (
            <Controller
              control={control}
              name="customTtl"
              render={({ field, fieldState }) => (
                <>
                  <Input
                    {...field}
                    ref={(el) => {
                      field.ref(el);
                      customTtlInputRef.current = el;
                    }}
                    className="mt-2"
                    placeholder="90m"
                    isError={Boolean(fieldState.error)}
                  />
                  <FieldDescription>A duration such as 30m, 8h, or 7d.</FieldDescription>
                  <FieldError>{fieldState.error?.message}</FieldError>
                </>
              )}
            />
          )}
          {ttlPreset === NEVER_TTL && (
            <FieldDescription>This session runs until someone revokes it.</FieldDescription>
          )}
        </FieldContent>
      </Field>

      {/* A warning, not a block: the session works for every other service, and picks up values
          set up later on the proxy's next poll. */}
      {needsSetup.length > 0 && (
        <Alert variant="warning">
          <TriangleAlertIcon />
          <AlertTitle>
            {needsSetup.length === 1
              ? "1 service requires your personal values"
              : `${needsSetup.length} services require your personal values`}
          </AlertTitle>
          <AlertDescription>
            <p>
              {needsSetup.length === 1
                ? "Until you set it up, this session can't reach it."
                : "Until you set them up, this session can't reach them."}
            </p>
            <ul className="mt-2 w-full divide-y divide-warning/15 rounded-md border border-warning/20">
              {shownNeedsSetup.map((service) => (
                <li key={service.id} className="flex items-center gap-2 px-2.5 py-1.5">
                  <ServiceIcon hostPattern={hostPatternOf(service)} serviceType={service.type} />
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {service.name}
                  </span>
                  <Button variant="warning" size="xs" onClick={() => setServiceToSetUp(service)}>
                    Set Up
                  </Button>
                </li>
              ))}
              {hiddenNeedsSetupCount > 0 && (
                <li className="px-2.5 py-1.5 text-xs">
                  {accessBundle && !pickedNeedsSetup.length ? (
                    <Link
                      to="/organizations/$orgId/projects/agent-vault/$projectId/access-bundles/$accessBundleId"
                      params={{
                        orgId: currentOrg.id,
                        projectId,
                        accessBundleId: accessBundle.id
                      }}
                      className="underline underline-offset-2 hover:text-foreground"
                    >
                      {hiddenNeedsSetupCount} more in {accessBundle.name}
                    </Link>
                  ) : (
                    <Link
                      to="/organizations/$orgId/projects/agent-vault/$projectId/services"
                      params={{ orgId: currentOrg.id, projectId }}
                      search={{ requiresSetup: true }}
                      className="underline underline-offset-2 hover:text-foreground"
                    >
                      {hiddenNeedsSetupCount} more on the Services page
                    </Link>
                  )}
                </li>
              )}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <PersonalValuesDialog
        target={serviceToSetUp ? { service: serviceToSetUp } : null}
        onOpenChange={(open) => {
          if (!open) setServiceToSetUp(null);
        }}
      />
    </form>
  );
};
