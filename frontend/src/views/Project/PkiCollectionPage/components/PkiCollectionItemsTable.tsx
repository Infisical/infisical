import { useState } from "react";
import { faBoxesStacked, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  EmptyState,
  IconButton,
  Pagination,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tooltip,
  Tr
} from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { useListPkiCollectionItems } from "@app/hooks/api";
import { PkiItemType, pkiItemTypeToNameMap } from "@app/hooks/api/pkiCollections/constants";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  collectionId: string;
  type: PkiItemType;
  handlePopUpOpen: (popUpName: keyof UsePopUpState<["deletePkiCollectionItem"]>, data?: {}) => void;
};

const PER_PAGE_INIT = 25;

export const PkiCollectionItemsTable = ({ collectionId, type, handlePopUpOpen }: Props) => {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(PER_PAGE_INIT);

  const { data, isLoading } = useListPkiCollectionItems({
    collectionId,
    offset: (page - 1) * perPage,
    limit: perPage,
    type
  });

  return (
    <div>
      <TableContainer>
        <Table>
          <THead>
            <Tr>
              <Th>Friendly Name</Th>
              <Th>Not Before</Th>
              <Th>Not After</Th>
              <Th className="w-5" />
            </Tr>
          </THead>
          <TBody>
            {isLoading && <TableSkeleton columns={2} innerKey="pki-collections" />}
            {!isLoading &&
              data?.collectionItems.map((collectionItem) => {
                return (
                  <Tr className="group" key={`pki-collection-item-${collectionItem.id}`}>
                    <Td className="w-1/3">{collectionItem.friendlyName}</Td>
                    <Td>{format(new Date(collectionItem.notBefore), "yyyy-MM-dd")}</Td>
                    <Td>{format(new Date(collectionItem.notAfter), "yyyy-MM-dd")}</Td>
                    <Td>
                      <div className="opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                        <ProjectPermissionCan
                          I={ProjectPermissionActions.Delete}
                          a={ProjectPermissionSub.PkiCollections}
                        >
                          {(isAllowed) => (
                            <Tooltip content="Remove">
                              <IconButton
                                colorSchema="danger"
                                ariaLabel="copy icon"
                                variant="plain"
                                className="group relative"
                                isDisabled={!isAllowed}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePopUpOpen("deletePkiCollectionItem", {
                                    collectionId,
                                    itemId: collectionItem.id
                                  });
                                }}
                              >
                                <FontAwesomeIcon icon={faXmark} />
                              </IconButton>
                            </Tooltip>
                          )}
                        </ProjectPermissionCan>
                      </div>
                    </Td>
                  </Tr>
                );
              })}
          </TBody>
        </Table>
        {!isLoading && data?.totalCount !== undefined && data.totalCount >= PER_PAGE_INIT && (
          <Pagination
            count={data.totalCount}
            page={page}
            perPage={perPage}
            onChangePage={(newPage) => setPage(newPage)}
            onChangePerPage={(newPerPage) => setPerPage(newPerPage)}
          />
        )}
        {!isLoading && !data?.collectionItems?.length && (
          <EmptyState
            title={`No ${pkiItemTypeToNameMap[type]}s have been added to this collection`}
            icon={faBoxesStacked}
          />
        )}
      </TableContainer>
    </div>
  );
};
