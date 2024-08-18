import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { DeleteActionModal, IconButton } from "@app/components/v2";
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
    <div className="w-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-4">
        <h3 className="text-lg font-semibold text-mineshaft-100">{sectionName}</h3>
        <IconButton
          ariaLabel="copy icon"
          variant="plain"
          className="group relative"
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
      <DeleteActionModal
        isOpen={popUp.deletePkiCollectionItem.isOpen}
        title={`Are you sure want to remove the item from the collection ${pkiCollection.name}?`}
        onChange={(isOpen) => handlePopUpToggle("deletePkiCollectionItem", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() => {
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
