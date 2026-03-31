import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@app/components/v3";
import { PAM_RESOURCE_TYPE_MAP, PamResourceType, TPamResource } from "@app/hooks/api/pam";

import { PamResourceForm } from "./PamResourceForm";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  resource?: TPamResource;
};

export const PamUpdateResourceModal = ({ isOpen, onOpenChange, resource }: Props) => {
  if (!resource) return null;

  const isDomain = resource.resourceType === PamResourceType.ActiveDirectory;
  const entityLabel = isDomain ? "Domain" : "Resource";

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full max-h-full flex-col gap-y-0 sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle>Edit {entityLabel}</SheetTitle>
          <SheetDescription>
            Update details for this {PAM_RESOURCE_TYPE_MAP[resource.resourceType].name}{" "}
            {entityLabel.toLowerCase()}.
          </SheetDescription>
        </SheetHeader>
        <PamResourceForm
          closeSheet={() => onOpenChange(false)}
          resource={resource}
          projectId={resource.projectId}
        />
      </SheetContent>
    </Sheet>
  );
};
