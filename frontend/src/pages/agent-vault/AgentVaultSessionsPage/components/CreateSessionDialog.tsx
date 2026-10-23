import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { PackageIcon, TriangleAlertIcon } from "lucide-react";
import ms from "ms";

import { PersonalValuesDialog } from "@app/components/agent-vault/PersonalValuesDialog";
import { ServiceIcon } from "@app/components/agent-vault/ServiceIconStack";
import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Combobox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { useOrganization } from "@app/context";
import { useDebounce } from "@app/hooks";
import {
  useCreateAgentVaultSession,
  useGetAgentVaultAccessBundle,
  useListAgentVaultAccessBundles
} from "@app/hooks/api/agentVault";
import {
  TAgentVaultAccessBundleListItem,
  TAgentVaultMintedSession,
  TAgentVaultService
} from "@app/hooks/api/agentVault/types";

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

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onCreated: (session: TAgentVaultMintedSession) => void;
};

export const CreateSessionDialog = ({ isOpen, onOpenChange, onCreated }: Props) => {
  const { currentOrg } = useOrganization();
  const [bundleSearch, setBundleSearch] = useState("");
  const [debouncedBundleSearch] = useDebounce(bundleSearch);
  const { data: accessBundles, isFetching: isSearchingBundles } = useListAgentVaultAccessBundles({
    search: debouncedBundleSearch.trim() || undefined,
    orderBy: "name",
    orderDirection: "asc",
    limit: 50
  });
  const createSession = useCreateAgentVaultSession();

  const [selectedBundle, setSelectedBundle] = useState<TAgentVaultAccessBundleListItem | null>(
    null
  );
  const { data: selectedBundleDetails } = useGetAgentVaultAccessBundle(selectedBundle?.id ?? "");
  const needsSetup =
    selectedBundle && selectedBundleDetails?.id === selectedBundle.id
      ? selectedBundleDetails.services.filter(
          (service) => service.personalValues && !service.personalValues.isConfigured
        )
      : [];
  // Past four, three are listed and the rest link to the bundle, whose table lists every one.
  const shownNeedsSetup = needsSetup.length > 4 ? needsSetup.slice(0, 3) : needsSetup;
  const hiddenNeedsSetupCount = needsSetup.length - shownNeedsSetup.length;
  const [serviceToSetUp, setServiceToSetUp] = useState<TAgentVaultService | null>(null);
  const [ttlPreset, setTtlPreset] = useState(DEFAULT_TTL_PRESET);
  const [customTtl, setCustomTtl] = useState("");
  const customTtlInputRef = useRef<HTMLInputElement>(null);
  const shouldFocusCustomTtlRef = useRef(false);

  const isCustomTtl = ttlPreset === CUSTOM_TTL;
  const ttl = isCustomTtl ? customTtl.trim() : ttlPreset;
  const customTtlError = isCustomTtl ? getCustomTtlError(customTtl) : null;
  const isTtlValid = customTtlError === null;
  const visibleTtlError = customTtl.length > 0 ? customTtlError : null;

  useEffect(() => {
    if (isOpen) {
      setSelectedBundle(null);
      setTtlPreset(DEFAULT_TTL_PRESET);
      setCustomTtl("");
    }
  }, [isOpen]);

  const handleCreate = async () => {
    if (!selectedBundle) return;

    try {
      const session = await createSession.mutateAsync({
        accessBundles: [selectedBundle.name],
        ttl
      });
      createNotification({ text: "Session created", type: "success" });
      onCreated(session);
      onOpenChange(false);
    } catch {
      // A failed request returns a 4xx that the global request handler surfaces as a toast
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Session</DialogTitle>
          <DialogDescription>
            An agent running with this session can only reach the hosts in the session&apos;s
            associated access bundle.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="agent-vault-session-bundle">Access Bundle</FieldLabel>
            <FieldContent>
              <Combobox
                id="agent-vault-session-bundle"
                options={accessBundles?.accessBundles ?? []}
                value={selectedBundle}
                shouldFilter={false}
                isLoading={isSearchingBundles}
                includeMissingSelectedOptions
                onInputValueChange={setBundleSearch}
                getOptionValue={(bundle) => bundle.id}
                getOptionLabel={(bundle) => bundle.name}
                placeholder="Pick an access bundle"
                searchPlaceholder="Search access bundles..."
                emptyMessage="No access bundle matches."
                modal
                renderOption={(bundle) => (
                  <span className="flex min-w-0 items-center gap-2">
                    <PackageIcon className="size-4 shrink-0 text-muted" />
                    <span className="truncate">{bundle.name}</span>
                  </span>
                )}
                renderValue={(bundle) => (
                  <span className="flex min-w-0 items-center gap-2">
                    <PackageIcon className="size-4 shrink-0 text-muted" />
                    <span className="truncate">{bundle.name}</span>
                  </span>
                )}
                onValueChange={setSelectedBundle}
                onClear={() => setSelectedBundle(null)}
              />
            </FieldContent>
          </Field>

          <Field>
            <FieldLabel>Expires</FieldLabel>
            <FieldContent>
              <Select
                value={ttlPreset}
                onValueChange={(value) => {
                  shouldFocusCustomTtlRef.current = value === CUSTOM_TTL;
                  setTtlPreset(value);
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
              {isCustomTtl && (
                <>
                  <Input
                    ref={customTtlInputRef}
                    className="mt-2"
                    value={customTtl}
                    onChange={(e) => setCustomTtl(e.target.value)}
                    placeholder="90m"
                    isError={visibleTtlError !== null}
                  />
                  <FieldDescription>A duration such as 30m, 8h, or 7d.</FieldDescription>
                  <FieldError>{visibleTtlError}</FieldError>
                </>
              )}
              {ttlPreset === NEVER_TTL && (
                <FieldDescription>This session runs until someone revokes it.</FieldDescription>
              )}
            </FieldContent>
          </Field>

          {/* A warning, not a block: the session works for every other service, and picks up values
              set up later on the proxy's next poll. */}
          {needsSetup.length > 0 && selectedBundle && (
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
                      <ServiceIcon hostPattern={service.hostPattern} />
                      <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                        {service.name}
                      </span>
                      <Button
                        variant="warning"
                        size="xs"
                        onClick={() => setServiceToSetUp(service)}
                      >
                        Set Up
                      </Button>
                    </li>
                  ))}
                  {hiddenNeedsSetupCount > 0 && (
                    <li className="px-2.5 py-1.5 text-xs">
                      <Link
                        to="/organizations/$orgId/agent-vault/access-bundles/$accessBundleId"
                        params={{ orgId: currentOrg.id, accessBundleId: selectedBundle.id }}
                        className="underline underline-offset-2 hover:text-foreground"
                      >
                        {hiddenNeedsSetupCount} more in {selectedBundle.name}
                      </Link>
                    </li>
                  )}
                </ul>
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="av"
            isDisabled={!selectedBundle || !isTtlValid}
            isPending={createSession.isPending}
            onClick={async () => handleCreate()}
          >
            Create Session
          </Button>
        </DialogFooter>

        <PersonalValuesDialog
          target={
            serviceToSetUp && selectedBundle
              ? { service: serviceToSetUp, accessBundleName: selectedBundle.name }
              : null
          }
          onOpenChange={(open) => {
            if (!open) setServiceToSetUp(null);
          }}
        />
      </DialogContent>
    </Dialog>
  );
};
