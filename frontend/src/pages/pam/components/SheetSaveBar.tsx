import { Button } from "@app/components/v3";

type Props = {
  isPending?: boolean;
  onDiscard: () => void;
};

export const SheetSaveBar = ({ isPending, onDiscard }: Props) => (
  <div className="sticky bottom-0 -mx-4 mt-auto -mb-4 flex items-center justify-end gap-2 border-t border-border bg-popover px-4 py-3">
    <Button type="button" variant="ghost" onClick={onDiscard}>
      Discard
    </Button>
    <Button type="submit" variant="pam" isPending={isPending}>
      Save Changes
    </Button>
  </div>
);
