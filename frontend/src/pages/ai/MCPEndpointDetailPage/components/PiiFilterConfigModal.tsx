import { useEffect, useRef, useState } from "react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FilterableSelect,
  Modal,
  ModalClose,
  ModalContent,
  Switch
} from "@app/components/v2";
import { TAiMcpEndpointWithServerIds, useUpdateAiMcpEndpoint } from "@app/hooks/api";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  endpoint: TAiMcpEndpointWithServerIds;
};

const PII_ENTITY_OPTIONS = [
  { value: "EMAIL", label: "Email" },
  { value: "PHONE", label: "Phone" },
  { value: "SSN", label: "SSN" },
  { value: "CREDIT_CARD", label: "Credit Card" },
  { value: "IP_ADDRESS", label: "IP Address" }
];

export const PiiFilterConfigModal = ({ isOpen, onOpenChange, endpoint }: Props) => {
  const modalContainer = useRef<HTMLDivElement>(null);
  const updateEndpoint = useUpdateAiMcpEndpoint();

  const [piiRequestFiltering, setPiiRequestFiltering] = useState(
    endpoint.piiRequestFiltering ?? false
  );
  const [piiResponseFiltering, setPiiResponseFiltering] = useState(
    endpoint.piiResponseFiltering ?? false
  );
  const [selectedEntityTypes, setSelectedEntityTypes] = useState<
    Array<{ value: string; label: string }>
  >([]);

  // Sync state when endpoint changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setPiiRequestFiltering(endpoint.piiRequestFiltering ?? false);
      setPiiResponseFiltering(endpoint.piiResponseFiltering ?? false);
      const existingTypes = (endpoint.piiEntityTypes || [])
        .map((type) => PII_ENTITY_OPTIONS.find((opt) => opt.value === type))
        .filter((opt): opt is { value: string; label: string } => opt !== undefined);
      setSelectedEntityTypes(existingTypes);
    }
  }, [isOpen, endpoint]);

  const handleSave = async () => {
    try {
      await updateEndpoint.mutateAsync({
        endpointId: endpoint.id,
        piiRequestFiltering,
        piiResponseFiltering,
        piiEntityTypes: selectedEntityTypes.map((opt) => opt.value)
      });
      createNotification({
        text: "PII filter settings updated successfully",
        type: "success"
      });
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to update PII filter settings:", error);
      createNotification({
        text: "Failed to update PII filter settings",
        type: "error"
      });
    }
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent ref={modalContainer} title="Configure PII Filters">
        <div className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-mineshaft-200">Filter Requests</p>
                <p className="text-xs text-bunker-400">
                  Redact PII from requests sent to MCP servers
                </p>
              </div>
              <Switch
                id="pii-request-filtering"
                isChecked={piiRequestFiltering}
                onCheckedChange={setPiiRequestFiltering}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-mineshaft-200">Filter Responses</p>
                <p className="text-xs text-bunker-400">
                  Redact PII from responses returned to users
                </p>
              </div>
              <Switch
                id="pii-response-filtering"
                isChecked={piiResponseFiltering}
                onCheckedChange={setPiiResponseFiltering}
              />
            </div>
          </div>

          <div className="border-t border-mineshaft-600 pt-4">
            <p className="mb-3 text-sm font-medium text-mineshaft-200">PII Detection</p>
            <FilterableSelect
              isMulti
              menuPortalTarget={modalContainer.current}
              menuPlacement="bottom"
              placeholder="Select PII types to detect..."
              options={PII_ENTITY_OPTIONS}
              value={selectedEntityTypes}
              onChange={(newValue) =>
                setSelectedEntityTypes(newValue as Array<{ value: string; label: string }>)
              }
            />
            <p className="mt-2 text-xs text-bunker-400">
              Select the types of personally identifiable information to redact
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <ModalClose asChild>
              <Button variant="plain" colorSchema="secondary">
                Cancel
              </Button>
            </ModalClose>
            <Button onClick={handleSave} isLoading={updateEndpoint.isPending}>
              Save
            </Button>
          </div>
        </div>
      </ModalContent>
    </Modal>
  );
};
