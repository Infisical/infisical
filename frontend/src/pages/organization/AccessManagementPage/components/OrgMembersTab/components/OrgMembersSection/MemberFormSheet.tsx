import { type FormEventHandler, type ReactNode } from "react";

import {
  Button,
  type ButtonProps,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";

type MemberFormSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description: ReactNode;
  children: ReactNode;
};

export const MemberFormSheet = ({
  open,
  onOpenChange,
  title,
  description,
  children
}: MemberFormSheetProps) => (
  <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent className="w-full gap-0 sm:max-w-xl">
      <SheetHeader className="shrink-0 pr-12">
        <SheetTitle>{title}</SheetTitle>
        <SheetDescription>{description}</SheetDescription>
      </SheetHeader>
      {children}
    </SheetContent>
  </Sheet>
);

export const MemberFormSheetBody = ({ children }: { children: ReactNode }) => (
  <div className="thin-scrollbar flex-1 space-y-4 overflow-y-auto p-4">{children}</div>
);

export const MemberFormSheetFooter = ({ children }: { children: ReactNode }) => (
  <SheetFooter className="shrink-0 justify-end border-t bg-popover">{children}</SheetFooter>
);

type MemberFormSheetFormProps = {
  children: ReactNode;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onCancel: () => void;
  submitVariant: ButtonProps["variant"];
  isSubmitting: boolean;
  submitLabel?: ReactNode;
};

export const MemberFormSheetForm = ({
  children,
  onSubmit,
  onCancel,
  submitVariant,
  isSubmitting,
  submitLabel = "Add Member"
}: MemberFormSheetFormProps) => (
  <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
    <MemberFormSheetBody>{children}</MemberFormSheetBody>
    <MemberFormSheetFooter>
      <Button variant="ghost" type="button" onClick={onCancel}>
        Cancel
      </Button>
      <Button
        variant={submitVariant}
        type="submit"
        isPending={isSubmitting}
        isDisabled={isSubmitting}
      >
        {submitLabel}
      </Button>
    </MemberFormSheetFooter>
  </form>
);
