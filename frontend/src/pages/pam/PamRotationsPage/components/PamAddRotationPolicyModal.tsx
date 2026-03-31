import { useState } from "react";

import {
  Button,
  Field,
  FieldContent,
  FieldLabel,
  Label,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  UnstableInput
} from "@app/components/v3";

import { ROTATION_POLICY_TYPE_MAP, RotationPolicyType } from "../mock-data";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const PamAddRotationPolicyModal = ({ isOpen, onOpenChange }: Props) => {
  const [selectedType, setSelectedType] = useState<RotationPolicyType | null>(null);
  const [name, setName] = useState("");

  const handleClose = () => {
    onOpenChange(false);
    setSelectedType(null);
    setName("");
  };

  const handleCreate = () => {
    handleClose();
  };

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
        else onOpenChange(open);
      }}
    >
      <SheetContent className="flex h-full max-h-full flex-col gap-y-0 sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle>{selectedType ? "Create Rotation Policy" : "Select Policy Type"}</SheetTitle>
          <SheetDescription>
            {selectedType
              ? "Configure the rotation policy details"
              : "Choose the type of rotation policy to create"}
          </SheetDescription>
        </SheetHeader>

        {!selectedType ? (
          <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
            {Object.entries(ROTATION_POLICY_TYPE_MAP).map(([type, { name: typeName, image }]) => (
              <Button
                key={type}
                onClick={() => setSelectedType(type as RotationPolicyType)}
                size="lg"
                variant="neutral"
                className="w-full justify-start"
              >
                <img
                  src={`/images/integrations/${image}`}
                  className="size-6"
                  alt={`${typeName} logo`}
                />
                <Label className="pointer-events-none">{typeName}</Label>
              </Button>
            ))}
          </div>
        ) : (
          <>
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
              <div className="flex items-center gap-2.5 border-b border-border pb-3">
                <img
                  alt={ROTATION_POLICY_TYPE_MAP[selectedType].name}
                  src={`/images/integrations/${ROTATION_POLICY_TYPE_MAP[selectedType].image}`}
                  className="size-9"
                />
                <div>
                  <Label>{ROTATION_POLICY_TYPE_MAP[selectedType].name}</Label>
                  <p className="text-xs text-muted">Rotation Policy</p>
                </div>
                <Button
                  size="xs"
                  variant="neutral"
                  className="ml-auto"
                  onClick={() => setSelectedType(null)}
                >
                  Change
                </Button>
              </div>
              <Field>
                <FieldLabel>Policy Name</FieldLabel>
                <FieldContent>
                  <UnstableInput
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Production DB Rotation"
                  />
                </FieldContent>
              </Field>
            </div>
            <SheetFooter className="shrink-0 border-t">
              <Button variant="neutral" onClick={handleCreate} isDisabled={!name.trim()}>
                Create Policy
              </Button>
              <Button variant="outline" className="mr-auto" onClick={handleClose}>
                Cancel
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};
