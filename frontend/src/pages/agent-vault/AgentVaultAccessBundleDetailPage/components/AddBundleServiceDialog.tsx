import { useMemo, useState } from "react";

import { hostPatternOf } from "@app/components/agent-vault/service-sheet/serviceSchema";
import { ServiceIcon } from "@app/components/agent-vault/ServiceIconStack";
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
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel
} from "@app/components/v3";
import { useProject } from "@app/context";
import { useDebounce } from "@app/hooks";
import {
  useAddAgentVaultAccessBundleService,
  useListAgentVaultServices
} from "@app/hooks/api/agentVault";
import { TAgentVaultProjectService } from "@app/hooks/api/agentVault/types";

const CREATE_LABEL = "Create New Service";
const PICKER_LIMIT = 100;

type Props = {
  accessBundleId: string;
  bundleServiceIds: string[];
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onCreateNew: () => void;
};

export const AddBundleServiceDialog = ({
  accessBundleId,
  bundleServiceIds,
  isOpen,
  onOpenChange,
  onCreateNew
}: Props) => {
  const { projectId } = useProject();
  const addService = useAddAgentVaultAccessBundleService(projectId);
  const [services, setServices] = useState<TAgentVaultProjectService[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);

  const { data, isFetching } = useListAgentVaultServices(
    projectId,
    { search: debouncedSearch.trim() || undefined, limit: PICKER_LIMIT },
    { enabled: isOpen }
  );

  const options = useMemo(() => {
    const inBundle = new Set(bundleServiceIds);
    return (data?.services ?? []).filter((option) => !inBundle.has(option.id));
  }, [data, bundleServiceIds]);

  const isListTruncated = (data?.totalCount ?? 0) > (data?.services.length ?? 0);

  const handleClose = () => {
    setServices([]);
    setSearch("");
    onOpenChange(false);
  };

  const handleAdd = async () => {
    if (services.length === 0) return;
    try {
      // All or nothing: if one is missing or covers a host the bundle has, none are added and the error says which.
      const { services: added } = await addService.mutateAsync({
        accessBundleId,
        serviceIds: services.map((service) => service.id)
      });
      if (added.length > 0) {
        createNotification({
          text:
            added.length === 1
              ? `Service "${added[0].name}" added`
              : `${added.length} services added`,
          type: "success"
        });
      }
      handleClose();
    } catch {
      // The global mutation handler shows the server's message.
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          handleClose();
          return;
        }
        onOpenChange(open);
      }}
    >
      <DialogContent isPending={addService.isPending}>
        <DialogHeader>
          <DialogTitle>Add Services</DialogTitle>
          <DialogDescription>
            Pick services from this project, or create a new one. Sessions on this bundle reach them
            at the next proxy poll.
          </DialogDescription>
        </DialogHeader>

        <Field>
          <FieldLabel htmlFor="agent-vault-add-bundle-services">Services</FieldLabel>
          <FieldContent>
            <Combobox<TAgentVaultProjectService>
              id="agent-vault-add-bundle-services"
              multiple
              options={options}
              value={services}
              isLoading={isFetching}
              onSearchChange={setSearch}
              getOptionValue={(option) => option.id}
              getOptionLabel={(option) => option.name}
              getOptionKeywords={(option) => [
                option.description ?? "",
                hostPatternOf(option) ?? ""
              ]}
              renderOption={(option) => (
                <div className="flex min-w-0 items-center gap-2">
                  <ServiceIcon hostPattern={hostPatternOf(option)} serviceType={option.type} />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm">{option.name}</span>
                    {option.description && (
                      <span className="truncate text-xs text-muted">{option.description}</span>
                    )}
                  </div>
                </div>
              )}
              placeholder="Pick services"
              searchPlaceholder="Search services..."
              searchAriaLabel="Search services"
              emptyMessage={search ? "No services match your search" : "No services to add"}
              modal
              onValueChange={setServices}
              creation={{
                mode: "action",
                emptyLabel: CREATE_LABEL,
                formatLabel: () => CREATE_LABEL,
                onAction: () => {
                  handleClose();
                  onCreateNew();
                }
              }}
            />
            {isListTruncated && (
              <FieldDescription>
                Search by name to find services that are not listed.
              </FieldDescription>
            )}
          </FieldContent>
        </Field>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} isDisabled={addService.isPending}>
            Cancel
          </Button>
          <Button
            variant="av"
            isPending={addService.isPending}
            isDisabled={services.length === 0}
            onClick={handleAdd}
          >
            {services.length > 1 ? `Add ${services.length} Services` : "Add Service"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
