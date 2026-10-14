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
      <SheetContent className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Share a Secret</SheetTitle>
          <SheetDescription>
            Create an encrypted link with controls for access, expiration, and delivery.
          </SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
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
