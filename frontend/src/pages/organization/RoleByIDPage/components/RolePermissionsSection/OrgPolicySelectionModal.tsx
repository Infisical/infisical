import { useFormContext, useWatch } from "react-hook-form";
import { CheckIcon } from "lucide-react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";

import { ORG_PERMISSION_OBJECT, TFormSchema } from "../OrgRoleModifySection.utils";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  children: React.ReactNode;
  invalidSubjects?: string[];
};

const Content = ({ invalidSubjects }: { invalidSubjects?: string[] }) => {
  const form = useFormContext<TFormSchema>();
  const currentPermissions = useWatch({ control: form.control, name: "permissions" });

  const handleSelectPolicy = (subject: string) => {
    const existingValue = form.getValues(`permissions.${subject}` as never);
    if (existingValue !== undefined) {
      form.setValue(`permissions.${subject}` as never, undefined as never, { shouldDirty: true });
    } else {
      form.setValue(`permissions.${subject}` as never, {} as never, { shouldDirty: true });
    }
  };

  const filteredSubjects = Object.entries(ORG_PERMISSION_OBJECT)
    .filter(([subject]) => !invalidSubjects?.includes(subject))
    .sort((a, b) => a[1].title.localeCompare(b[1].title))
    .map(([subject]) => subject);

  return (
    <Command
      filter={(_, search, keywords) => {
        if (keywords?.some((k) => k.toLowerCase().includes(search.toLowerCase()))) return 1;
        return 0;
      }}
    >
      <CommandInput placeholder="Search policies..." />
      <CommandList>
        <CommandEmpty>No policies found.</CommandEmpty>
        <CommandGroup>
          {filteredSubjects.map((subject) => {
            const hasPolicy =
              currentPermissions?.[subject as keyof typeof currentPermissions] !== undefined;

            return (
              <CommandItem
                key={`permission-add-${subject}`}
                value={subject}
                keywords={[ORG_PERMISSION_OBJECT[subject].title]}
                onSelect={handleSelectPolicy}
              >
                <CheckIcon
                  className={cn("size-4 shrink-0", hasPolicy ? "opacity-100" : "opacity-0")}
                />
                <span>{ORG_PERMISSION_OBJECT[subject].title}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </Command>
  );
};

export const OrgPolicySelectionPopover = ({
  isOpen,
  onOpenChange,
  children,
  invalidSubjects
}: Props) => {
  return (
    <Popover open={isOpen} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0" onWheel={(e) => e.stopPropagation()}>
        <Content invalidSubjects={invalidSubjects} />
      </PopoverContent>
    </Popover>
  );
};
