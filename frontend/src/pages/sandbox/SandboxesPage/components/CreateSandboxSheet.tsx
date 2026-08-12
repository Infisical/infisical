import { useState } from "react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Field,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  TextArea
} from "@app/components/v3";
import { useCreateSandbox } from "@app/hooks/api/sandboxes";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onCreated: (sandboxId: string) => void;
};

const SIZES = [
  { label: "Small", vcpu: 1, memoryMb: 1024 },
  { label: "Medium", vcpu: 2, memoryMb: 2048 },
  { label: "Large", vcpu: 4, memoryMb: 8192 }
];

export const CreateSandboxSheet = ({ isOpen, onOpenChange, onCreated }: Props) => {
  const createSandbox = useCreateSandbox();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sizeIndex, setSizeIndex] = useState(1);

  const reset = () => {
    setName("");
    setDescription("");
    setSizeIndex(1);
  };

  const handleCreate = async () => {
    const size = SIZES[sizeIndex];

    const sandbox = await createSandbox.mutateAsync({
      name: name.trim(),
      description: description.trim() || undefined,
      vcpu: size.vcpu,
      memoryMb: size.memoryMb
    });

    createNotification({ type: "success", text: `Sandbox "${sandbox.name}" created` });
    reset();
    onOpenChange(false);
    onCreated(sandbox.id);
  };

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <SheetContent side="right" className="flex flex-col sm:max-w-md">
        <SheetHeader className="border-b pr-12">
          <SheetTitle>Create Sandbox</SheetTitle>
          <SheetDescription>
            An isolated environment. You choose what it can reach after it is created.
          </SheetDescription>
        </SheetHeader>

        <div className="flex thin-scrollbar flex-1 flex-col gap-4 overflow-y-auto p-4">
          <Field>
            <FieldLabel htmlFor="sandbox-name">Name</FieldLabel>
            <Input
              id="sandbox-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="sales-agent"
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="sandbox-description">Description</FieldLabel>
            <TextArea
              id="sandbox-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this sandbox is for"
              rows={3}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="sandbox-size">Size</FieldLabel>
            <Select value={String(sizeIndex)} onValueChange={(v) => setSizeIndex(Number(v))}>
              <SelectTrigger id="sandbox-size" className="w-full">
                <SelectValue placeholder="Choose a size" />
              </SelectTrigger>
              <SelectContent position="popper" className="w-(--radix-select-trigger-width)">
                {SIZES.map((size, index) => (
                  <SelectItem key={size.label} value={String(index)}>
                    {size.label} · {size.vcpu} vCPU · {size.memoryMb / 1024} GB
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <SheetFooter className="justify-end border-t">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="project"
            onClick={handleCreate}
            isDisabled={!name.trim()}
            isPending={createSandbox.isPending}
          >
            Create Sandbox
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
