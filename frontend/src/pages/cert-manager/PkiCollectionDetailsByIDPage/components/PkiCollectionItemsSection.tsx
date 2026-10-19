import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { IconButton } from "@app/components/v3";
import { ConfirmationAlertDialog } from "@app/components/v3/platform";
import { useGetPkiCollectionById, useRemoveItemFromPkiCollection } from "@app/hooks/api";
import { PkiItemType } from "@app/hooks/api/pkiCollections/constants";
import { usePopUp } from "@app/hooks/usePopUp";

import { AddPkiCollectionItemModal } from "./AddPkiCollectionItemModal";
import { PkiCollectionItemsTable } from "./PkiCollectionItemsTable";

type Props = {
  collectionId: string;
  type: PkiItemType;
};

export const PkiCollectionItemsSection = ({ collectionId, type }: Props) => {
  const { data: pkiCollection } = useGetPkiCollectionById(collectionId);
  const { mutateAsync: removeItemFromPkiCollection } = useRemoveItemFromPkiCollection();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "deletePkiCollectionItem",
    "addPkiCollectionItem"
  ] as const);

  const onRemovePkiCollectionItemSubmit = async (itemId: string) => {
    try {
      await removeItemFromPkiCollection({
        itemId,
        collectionId
      });

      createNotification({
        text: "Successfully removed item from PKI collection",
        type: "success"
      });

      handlePopUpClose("deletePkiCollectionItem");
    } catch (err) {
      console.error(err);
    }
  };

  const sectionName = type === PkiItemType.CA ? "Certificate Authorities" : "Certificates";

  return pkiCollection ? (
    <div className="w-full rounded-lg border border-border-control bg-surface-base p-4">
      <div className="flex items-center justify-between border-b border-border-emphasis pb-4">
        <h3 className="text-lg font-normal text-foreground">{sectionName}</h3>
        <IconButton
          aria-label={`Add to ${sectionName.toLowerCase()}`}
          variant="ghost"
          onClick={() => {
            handlePopUpOpen("addPkiCollectionItem");
          }}
        >
          <FontAwesomeIcon icon={faPlus} />
        </IconButton>
      </div>
      <div className="py-4">
        <PkiCollectionItemsTable
          type={type}
          collectionId={collectionId}
          handlePopUpOpen={handlePopUpOpen}
        />
      </div>
      <AddPkiCollectionItemModal
        collectionId={collectionId}
        type={type}
        popUp={popUp}
        handlePopUpToggle={handlePopUpToggle}
      />
      <ConfirmationAlertDialog
        isOpen={popUp.deletePkiCollectionItem.isOpen}
        title={`Are you sure you want to remove the item from the collection ${pkiCollection.name}?`}
        description="This action is irreversible."
        onOpenChange={(isOpen) => handlePopUpToggle("deletePkiCollectionItem", isOpen)}
        confirmKey="confirm"
        onConfirm={() => {
          const popupData = popUp?.deletePkiCollectionItem?.data as {
            itemId: string;
          };

          return onRemovePkiCollectionItemSubmit(popupData.itemId);
        }}
      />
    </div>
  ) : (
    <div />
  );
};
