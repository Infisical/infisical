import { faBan, faEllipsis, faPencil, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeletonRows
} from "@app/components/v3";
import {
  ProjectPermissionPkiSubscriberActions,
  ProjectPermissionSub,
  useOrganization,
  useProject
} from "@app/context";
import { useListWorkspacePkiSubscribers } from "@app/hooks/api";
import {
  getPkiSubscriberStatusBadgeVariant,
  PkiSubscriberStatus,
  pkiSubscriberStatusToNameMap
} from "@app/hooks/api/pkiSubscriber/constants";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["deletePkiSubscriber", "pkiSubscriber", "pkiSubscriberStatus"]>,
    data?: object
  ) => void;
};

export const PkiSubscribersTable = ({ handlePopUpOpen }: Props) => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const { data, isPending } = useListWorkspacePkiSubscribers(currentProject?.id || "");
  if (!isPending && !data?.length) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>No PKI subscribers have been added</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div>
      <Table className="w-full">
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Common Name</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {isPending && <TableSkeletonRows columns={4} />}
          {!isPending &&
            data &&
            data.length > 0 &&
            data.map((subscriber) => {
              return (
                <TableRow
                  key={`pki-subscriber-${subscriber.id}`}
                  onClick={() =>
                    navigate({
                      to: "/organizations/$orgId/cert-manager/subscribers/$subscriberName",
                      params: {
                        orgId: currentOrg.id,
                        subscriberName: subscriber.name
                      }
                    })
                  }
                >
                  <TableCell>{subscriber.name}</TableCell>
                  <TableCell>
                    <Badge variant={getPkiSubscriberStatusBadgeVariant(subscriber.status)}>
                      {pkiSubscriberStatusToNameMap[subscriber.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>{subscriber.commonName}</TableCell>
                  <TableCell className="text-right align-middle">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <IconButton variant="ghost" size="xs" aria-label="More options">
                          <FontAwesomeIcon icon={faEllipsis} />
                        </IconButton>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <ProjectPermissionCan
                          I={ProjectPermissionPkiSubscriberActions.Edit}
                          a={ProjectPermissionSub.PkiSubscribers}
                        >
                          {(isAllowed) => (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePopUpOpen("pkiSubscriber", {
                                  subscriberName: subscriber.name
                                });
                              }}
                              isDisabled={!isAllowed}
                            >
                              <FontAwesomeIcon icon={faPencil} />
                              Edit Subscriber
                            </DropdownMenuItem>
                          )}
                        </ProjectPermissionCan>
                        <ProjectPermissionCan
                          I={ProjectPermissionPkiSubscriberActions.Edit}
                          a={ProjectPermissionSub.PkiSubscribers}
                        >
                          {(isAllowed) => (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePopUpOpen("pkiSubscriberStatus", {
                                  subscriberName: subscriber.name,
                                  status:
                                    subscriber.status === PkiSubscriberStatus.ACTIVE
                                      ? PkiSubscriberStatus.DISABLED
                                      : PkiSubscriberStatus.ACTIVE
                                });
                              }}
                              isDisabled={!isAllowed}
                            >
                              <FontAwesomeIcon icon={faBan} />
                              {`${subscriber.status === PkiSubscriberStatus.ACTIVE ? "Disable" : "Enable"} Subscriber`}
                            </DropdownMenuItem>
                          )}
                        </ProjectPermissionCan>
                        <ProjectPermissionCan
                          I={ProjectPermissionPkiSubscriberActions.Delete}
                          a={ProjectPermissionSub.PkiSubscribers}
                        >
                          {(isAllowed) => (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePopUpOpen("deletePkiSubscriber", {
                                  subscriberName: subscriber.name
                                });
                              }}
                              isDisabled={!isAllowed}
                              variant="danger"
                            >
                              <FontAwesomeIcon icon={faTrash} />
                              Delete Subscriber
                            </DropdownMenuItem>
                          )}
                        </ProjectPermissionCan>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
        </TableBody>
      </Table>
    </div>
  );
};
