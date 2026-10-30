import { useState } from "react";
import { format } from "date-fns";
import { BoxesIcon, XIcon } from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  IconButton,
  Pagination,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeletonRows,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { useListPkiCollectionItems } from "@app/hooks/api";
import { PkiItemType, pkiItemTypeToNameMap } from "@app/hooks/api/pkiCollections/constants";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  collectionId: string;
  type: PkiItemType;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["deletePkiCollectionItem"]>,
    data?: object
  ) => void;
};

const PER_PAGE_INIT = 25;

export const PkiCollectionItemsTable = ({ collectionId, type, handlePopUpOpen }: Props) => {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(PER_PAGE_INIT);

  const { data, isPending } = useListPkiCollectionItems({
    collectionId,
    offset: (page - 1) * perPage,
    limit: perPage,
    type
  });

  return (
    <div>
      {!isPending && !data?.collectionItems?.length ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BoxesIcon />
            </EmptyMedia>
            <EmptyTitle>{`No ${pkiItemTypeToNameMap[type]}s have been added to this collection`}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Friendly Name</TableHead>
              <TableHead>Not Before</TableHead>
              <TableHead>Not After</TableHead>
              <TableHead className="w-5" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending && <TableSkeletonRows columns={4} />}
            {!isPending &&
              data?.collectionItems.map((collectionItem) => {
                return (
                  <TableRow className="group" key={`pki-collection-item-${collectionItem.id}`}>
                    <TableCell className="w-1/3">{collectionItem.friendlyName}</TableCell>
                    <TableCell>
                      {format(new Date(collectionItem.notBefore), "yyyy-MM-dd")}
                    </TableCell>
                    <TableCell>{format(new Date(collectionItem.notAfter), "yyyy-MM-dd")}</TableCell>
                    <TableCell>
                      <div className="opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                        <ProjectPermissionCan
                          I={ProjectPermissionActions.Delete}
                          a={ProjectPermissionSub.PkiCollections}
                        >
                          {(isAllowed) => (
                            <Tooltip hoverable delayDuration={50}>
                              <TooltipTrigger asChild>
                                <span className="inline-flex">
                                  <IconButton
                                    aria-label="Remove"
                                    variant="ghost"
                                    size="xs"
                                    isDisabled={!isAllowed}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handlePopUpOpen("deletePkiCollectionItem", {
                                        collectionId,
                                        itemId: collectionItem.id
                                      });
                                    }}
                                  >
                                    <XIcon />
                                  </IconButton>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>Remove</TooltipContent>
                            </Tooltip>
                          )}
                        </ProjectPermissionCan>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
      )}
      {!isPending && data?.totalCount !== undefined && data.totalCount >= PER_PAGE_INIT && (
        <Pagination
          count={data.totalCount}
          page={page}
          perPage={perPage}
          onChangePage={(newPage) => setPage(newPage)}
          onChangePerPage={(newPerPage) => setPerPage(newPerPage)}
        />
      )}
    </div>
  );
};
