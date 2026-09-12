import { useEffect, useRef, useState } from "react";
import { PackageIcon } from "lucide-react";
import ms from "ms";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Combobox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DiscardChangesAlertDialog,
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
import { useDiscardChangesGuard } from "@app/hooks";
import {
  useCreateAgentVaultSession,
  useListAgentVaultAccessBundles
} from "@app/hooks/api/agentVault";
import {
  TAgentVaultAccessBundleListItem,
  TAgentVaultMintedSession
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
  const { data: accessBundles } = useListAgentVaultAccessBundles();
  const createSession = useCreateAgentVaultSession();

  const [selectedBundle, setSelectedBundle] = useState<TAgentVaultAccessBundleListItem | null>(
    null
  );
  const [ttlPreset, setTtlPreset] = useState(DEFAULT_TTL_PRESET);
  const [customTtl, setCustomTtl] = useState("");
  const customTtlInputRef = useRef<HTMLInputElement>(null);
  const shouldFocusCustomTtlRef = useRef(false);

  const isCustomTtl = ttlPreset === CUSTOM_TTL;
  const ttl = isCustomTtl ? customTtl.trim() : ttlPreset;
  const customTtlError = isCustomTtl ? getCustomTtlError(customTtl) : null;
  const isTtlValid = customTtlError === null;
  const visibleTtlError = customTtl.length > 0 ? customTtlError : null;

  const isDirty = Boolean(selectedBundle) || customTtl.length > 0;
  const { confirmDiscard, isDiscardDialogOpen, requestDiscard, setIsDiscardDialogOpen } =
    useDiscardChangesGuard({ isDirty, onDiscard: () => onOpenChange(false) });

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
    <Dialog
      open={isOpen}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          onOpenChange(true);
          return;
        }
        requestDiscard();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Session</DialogTitle>
          <DialogDescription>
            An agent running with this session reaches the hosts in this access bundle and nothing
            else.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="agent-vault-session-bundle">Access Bundle</FieldLabel>
            <FieldContent>
              <Combobox
                id="agent-vault-session-bundle"
                options={accessBundles ?? []}
                value={selectedBundle}
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
                <FieldDescription>
                  This session keeps working until someone revokes it.
                </FieldDescription>
              )}
            </FieldContent>
          </Field>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={requestDiscard}>
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

        <DiscardChangesAlertDialog
          open={isDiscardDialogOpen}
          onOpenChange={setIsDiscardDialogOpen}
          onDiscard={confirmDiscard}
          title="Discard Changes?"
          description="The access bundle and expiry you picked will be lost."
        />
      </DialogContent>
    </Dialog>
  );
};
