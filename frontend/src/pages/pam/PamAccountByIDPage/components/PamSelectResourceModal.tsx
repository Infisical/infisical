import { useState } from "react";

import { Button, Modal, ModalContent, Select, SelectItem } from "@app/components/v2";
import { PAM_RESOURCE_TYPE_MAP, PamResourceType } from "@app/hooks/api/pam";
import { TPamDomainRelatedResource, useListDomainRelatedResources } from "@app/hooks/api/pamDomain";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  domainType: string;
  domainId: string;
  onSelect: (resource: TPamDomainRelatedResource) => void;
};

export const PamSelectResourceModal = ({
  isOpen,
  onOpenChange,
  domainType,
  domainId,
  onSelect
}: Props) => {
  const [selectedResourceId, setSelectedResourceId] = useState<string>("");
  const { data: resources } = useListDomainRelatedResources(domainType, domainId, {
    enabled: isOpen
  });

  const handleAccess = () => {
    const resource = resources?.find((r) => r.id === selectedResourceId);
    if (resource) {
      onSelect(resource);
      onOpenChange(false);
      setSelectedResourceId("");
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        onOpenChange(open);
        if (!open) setSelectedResourceId("");
      }}
    >
      <ModalContent
        title="Access Account"
        subTitle="Select a resource to access this domain account on."
      >
        <div className="mt-2">
          <Select
            value={selectedResourceId}
            onValueChange={setSelectedResourceId}
            placeholder="Select a resource..."
            className="w-full"
            position="popper"
          >
            {(resources || []).map((resource) => {
              const typeInfo = PAM_RESOURCE_TYPE_MAP[resource.resourceType as PamResourceType];
              return (
                <SelectItem key={resource.id} value={resource.id}>
                  <div className="flex items-center gap-2">
                    {typeInfo?.image && (
                      <img
                        alt={typeInfo.name}
                        src={`/images/integrations/${typeInfo.image}`}
                        className="size-4"
                      />
                    )}
                    {resource.name}
                  </div>
                </SelectItem>
              );
            })}
          </Select>
        </div>
        <div className="mt-4 flex gap-2">
          <Button onClick={handleAccess} isDisabled={!selectedResourceId} colorSchema="primary">
            Access
          </Button>
          <Button
            variant="outline_bg"
            onClick={() => {
              onOpenChange(false);
              setSelectedResourceId("");
            }}
          >
            Cancel
          </Button>
        </div>
      </ModalContent>
    </Modal>
  );
};
