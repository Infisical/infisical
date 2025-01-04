import { faGlobe, faPencil, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  EmptyState,
  IconButton,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tr,
  UpgradePlanModal
} from "@app/components/v2";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useSubscription,
  useWorkspace
} from "@app/context";
import { useGetTrustedIps } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  popUp: UsePopUpState<["upgradePlan"]>;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["trustedIp", "deleteTrustedIp", "upgradePlan"]>,
    data?: {
      trustedIpId: string;
      ipAddress?: string;
      comment?: string;
      isActive?: boolean;
      prefix?: number;
    }
  ) => void;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["upgradePlan"]>, state?: boolean) => void;
};

export const IPAllowlistTable = ({ popUp, handlePopUpOpen, handlePopUpToggle }: Props) => {
  const { subscription } = useSubscription();
  const { currentWorkspace } = useWorkspace();
  const { data, isLoading } = useGetTrustedIps(currentWorkspace?.id ?? "");

  const formatType = (type: string, prefix?: number) => {
    return `${type.slice(0, 2).toUpperCase() + type.slice(2)} ${
      prefix !== undefined ? "CIDR" : ""
    }`;
  };

  return (
    <div>
      <TableContainer className="mt-4">
        <Table>
          <THead>
            <Tr>
              <Th className="flex-1">IP Address / Range</Th>
              <Th className="flex-1">Format</Th>
              <Th className="flex-1">Comment</Th>
              {/* <Th className="flex-1">Status</Th> */}
              <Th className="w-5" />
            </Tr>
          </THead>
          <TBody>
            {!isLoading &&
              data &&
              data?.length > 0 &&
              data
                .sort((a, b) => a.ipAddress.localeCompare(b.ipAddress))
                .map(({ id, ipAddress, comment, type, prefix, isActive }) => {
                  return (
                    <Tr key={`ip-access-range-${id}`} className="h-10">
                      <Td>{`${ipAddress}${prefix !== undefined ? `/${prefix}` : ""}`}</Td>
                      <Td>{formatType(type, prefix)}</Td>
                      <Td>{comment}</Td>
                      {/* <Td>
                                        <div className="flex items-center">
                                            <FontAwesomeIcon 
                                                icon={faCircle} 
                                                color="#2ecc71"
                                            /> 
                                            <p className="ml-4">Active</p>
                                        </div>
                                    </Td> */}
                      <Td className="flex items-center">
                        <ProjectPermissionCan
                          I={ProjectPermissionActions.Edit}
                          a={ProjectPermissionSub.IpAllowList}
                        >
                          {(isAllowed) => (
                            <IconButton
                              className="mr-3 py-2"
                              onClick={() => {
                                if (subscription?.ipAllowlisting) {
                                  handlePopUpOpen("trustedIp", {
                                    trustedIpId: id,
                                    ipAddress,
                                    comment,
                                    prefix,
                                    isActive
                                  });
                                } else {
                                  handlePopUpOpen("upgradePlan");
                                }
                              }}
                              colorSchema="primary"
                              variant="plain"
                              ariaLabel="update"
                              isDisabled={!isAllowed}
                            >
                              <FontAwesomeIcon icon={faPencil} />
                            </IconButton>
                          )}
                        </ProjectPermissionCan>
                        <ProjectPermissionCan
                          I={ProjectPermissionActions.Delete}
                          a={ProjectPermissionSub.IpAllowList}
                        >
                          {(isAllowed) => (
                            <IconButton
                              onClick={() => {
                                if (subscription?.ipAllowlisting) {
                                  handlePopUpOpen("deleteTrustedIp", {
                                    trustedIpId: id
                                  });
                                } else {
                                  handlePopUpOpen("upgradePlan");
                                }
                              }}
                              size="lg"
                              colorSchema="danger"
                              variant="plain"
                              ariaLabel="update"
                              isDisabled={!isAllowed}
                            >
                              <FontAwesomeIcon icon={faXmark} />
                            </IconButton>
                          )}
                        </ProjectPermissionCan>
                      </Td>
                    </Tr>
                  );
                })}
            {isLoading && (
              <TableSkeleton innerKey="ip-access-table" columns={4} key="ip-access-ranges" />
            )}
            {!isLoading && data && data?.length === 0 && (
              <Tr>
                <Td colSpan={5}>
                  <EmptyState title="No IP addresses added" icon={faGlobe} />
                </Td>
              </Tr>
            )}
          </TBody>
        </Table>
      </TableContainer>
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text="You can use IP allowlisting if you switch to Infisical's Pro plan."
      />
    </div>
  );
};
