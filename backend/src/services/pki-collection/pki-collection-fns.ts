import { TPkiCollectionItems } from "@app/db/schemas/pki-collection-items";

import { PkiItemType } from "./pki-collection-types";

/**
 * Transforms a PKI Collection Item from the database to the expected API response format
 */
export const transformPkiCollectionItem = (pkiCollectionItem: TPkiCollectionItems) => {
  let type: PkiItemType;
  let itemId: string;

  if (pkiCollectionItem.caId) {
    type = PkiItemType.CA;
    itemId = pkiCollectionItem.caId;
  } else if (pkiCollectionItem.certId) {
    type = PkiItemType.CERTIFICATE;
    itemId = pkiCollectionItem.certId;
  } else {
    throw new Error("Invalid PKI Collection Item: must have either caId or certId");
  }

  return {
    id: pkiCollectionItem.id,
    pkiCollectionId: pkiCollectionItem.pkiCollectionId,
    type,
    itemId,
    createdAt: pkiCollectionItem.createdAt,
    updatedAt: pkiCollectionItem.updatedAt
  };
};
