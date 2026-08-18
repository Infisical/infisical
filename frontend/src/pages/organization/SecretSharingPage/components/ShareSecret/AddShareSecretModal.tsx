import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@app/components/v3";
import { useOrganization } from "@app/context";
import { UsePopUpState } from "@app/hooks/usePopUp";
import { ShareSecretForm } from "@app/pages/public/ShareSecretPage/components";

type Props = {
  popUp: UsePopUpState<["createSharedSecret"]>;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["createSharedSecret"]>,
    state?: boolean
  ) => void;
};

export const AddShareSecretModal = ({ popUp, handlePopUpToggle }: Props) => {
  const { currentOrg } = useOrganization();
  return (
    <Sheet
      open={popUp?.createSharedSecret?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("createSharedSecret", isOpen);
      }}
    >
      <SheetContent className="flex h-full max-h-full flex-col gap-0 sm:max-w-2xl">
        <SheetHeader className="border-b">
          <SheetTitle>Share a Secret</SheetTitle>
          <SheetDescription>Securely share one off secrets with your team.</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <ShareSecretForm
            isPublic={false}
            value={(popUp.createSharedSecret.data as { value?: string })?.value}
            allowSecretSharingOutsideOrganization={
              currentOrg?.allowSecretSharingOutsideOrganization ?? true
            }
            maxSharedSecretLifetime={currentOrg?.maxSharedSecretLifetime}
            maxSharedSecretViewLimit={currentOrg?.maxSharedSecretViewLimit}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
};
