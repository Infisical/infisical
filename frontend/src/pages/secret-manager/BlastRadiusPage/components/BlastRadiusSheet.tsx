import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@app/components/v3";

import { BlastRadiusPanel, TBlastRadiusPanelProps } from "./BlastRadiusPanel";

type Props = Omit<TBlastRadiusPanelProps, "reserveCloseAffordance"> & {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

/**
 * Blast radius as a drawer over the secrets list, which is where the question is asked from. The panel
 * itself is shared with the standalone route so a pasted link lands on the same view.
 */
export const BlastRadiusSheet = ({ isOpen, onOpenChange, ...panelProps }: Props) => (
  <Sheet open={isOpen} onOpenChange={onOpenChange}>
    <SheetContent
      side="right"
      className="gap-0 p-0 sm:max-w-[66rem]"
      onOpenAutoFocus={(event) => event.preventDefault()}
    >
      <SheetHeader className="sr-only">
        <SheetTitle>Blast Radius for {panelProps.secretKey}</SheetTitle>
        <SheetDescription>
          Who can read this secret, and what depends on its value.
        </SheetDescription>
      </SheetHeader>
      <BlastRadiusPanel {...panelProps} reserveCloseAffordance />
    </SheetContent>
  </Sheet>
);
