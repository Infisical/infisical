import { useState } from "react";
import {
  faCheckCircle,
  faClock,
  faEye,
  faGlobe,
  faMagnifyingGlass,
  faTimesCircle,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  DeleteActionModal,
  EmptyState,
  IconButton,
  Input,
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
import {
  OrgPermissionEmailDomainActions,
  OrgPermissionSubjects,
  useOrganization
} from "@app/context";
import { usePopUp } from "@app/hooks";
import { useDeleteEmailDomain, useGetEmailDomains } from "@app/hooks/api";

import { EmailDomainVerificationModal } from "./EmailDomainVerificationModal";

const STATUS_CONFIG = {
  pending: {
    label: "Pending",
    icon: faClock,
    className: "text-yellow-500"
  },
  verified: {
    label: "Verified",
    icon: faCheckCircle,
    className: "text-green-500"
  },
  expired: {
    label: "Expired",
    icon: faTimesCircle,
    className: "text-red-500"
  }
} as const;

export const OrgEmailDomainsTable = () => {
  const { currentOrg } = useOrganization();
  const { data: emailDomains, isPending } = useGetEmailDomains(currentOrg?.id ?? "");
  const [searchDomain, setSearchDomain] = useState("");
  const { handlePopUpToggle, popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "removeDomain",
    "verifyDomain"
  ] as const);
  const { mutateAsync: deleteEmailDomain } = useDeleteEmailDomain();

  const onRemoveDomain = async () => {
    const emailDomainId = (popUp?.removeDomain?.data as { id: string })?.id;
    if (!emailDomainId) return;

    try {
      await deleteEmailDomain({ emailDomainId });
      createNotification({
        text: "Successfully removed email domain",
        type: "success"
      });
      handlePopUpClose("removeDomain");
    } catch (error) {
      createNotification({
        text: (error as Error)?.message || "Failed to remove email domain",
        type: "error"
      });
    }
  };

  const filteredDomains = emailDomains
    ? emailDomains.filter(({ domain }) => domain.toLowerCase().includes(searchDomain.toLowerCase()))
    : [];

  return (
    <div>
      <Input
        value={searchDomain}
        onChange={(e) => setSearchDomain(e.target.value)}
        leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
        placeholder="Search domains..."
      />
      <TableContainer className="mt-4">
        <Table>
          <THead>
            <Tr>
              <Th>Domain</Th>
              <Th>Status</Th>
              <Th>Verified At</Th>
              <Th>Expires At</Th>
              <Th aria-label="actions" />
            </Tr>
          </THead>
          <TBody>
            {isPending && <TableSkeleton columns={5} innerKey="email-domains" />}
            {filteredDomains.map((emailDomain) => {
              const statusConfig = STATUS_CONFIG[emailDomain.status] || STATUS_CONFIG.pending;
              return (
                <Tr key={emailDomain.id}>
                  <Td className="max-w-xs">
                    <span className="font-medium">{emailDomain.domain}</span>
                    {emailDomain.parentDomain && (
                      <span className="ml-2 text-xs text-gray-500">
                        (subdomain of {emailDomain.parentDomain})
                      </span>
                    )}
                  </Td>
                  <Td>
                    <span className={twMerge("flex items-center gap-1.5", statusConfig.className)}>
                      <FontAwesomeIcon icon={statusConfig.icon} size="sm" />
                      {statusConfig.label}
                    </span>
                  </Td>
                  <Td>
                    {emailDomain.verifiedAt
                      ? format(new Date(emailDomain.verifiedAt), "MMM d, yyyy")
                      : "-"}
                  </Td>
                  <Td>
                    {emailDomain.status === "pending"
                      ? format(new Date(emailDomain.codeExpiresAt), "MMM d, yyyy")
                      : "-"}
                  </Td>
                  <Td>
                    <div className="flex items-center justify-end gap-2">
                      {emailDomain.status === "pending" && (
                        <OrgPermissionCan
                          I={OrgPermissionEmailDomainActions.VerifyDomain}
                          a={OrgPermissionSubjects.EmailDomains}
                        >
                          {(isAllowed) => (
                            <Tooltip content="View details & Verify">
                              <IconButton
                                ariaLabel="verify"
                                variant="plain"
                                onClick={() => handlePopUpOpen("verifyDomain", emailDomain)}
                                isDisabled={!isAllowed}
                              >
                                <FontAwesomeIcon icon={faEye} />
                              </IconButton>
                            </Tooltip>
                          )}
                        </OrgPermissionCan>
                      )}
                      <OrgPermissionCan
                        I={OrgPermissionEmailDomainActions.Delete}
                        an={OrgPermissionSubjects.EmailDomains}
                      >
                        {(isAllowed) => (
                          <Tooltip content="Delete">
                            <IconButton
                              ariaLabel="delete"
                              colorSchema="danger"
                              onClick={() =>
                                handlePopUpOpen("removeDomain", {
                                  id: emailDomain.id,
                                  domain: emailDomain.domain
                                })
                              }
                              isDisabled={!isAllowed}
                            >
                              <FontAwesomeIcon icon={faTrash} />
                            </IconButton>
                          </Tooltip>
                        )}
                      </OrgPermissionCan>
                    </div>
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
        {filteredDomains.length === 0 && !isPending && (
          <EmptyState title="No email domains found" icon={faGlobe} />
        )}
      </TableContainer>
      <DeleteActionModal
        isOpen={popUp.removeDomain.isOpen}
        deleteKey="remove"
        title={`Do you want to remove the domain "${(popUp?.removeDomain?.data as { domain?: string })?.domain}"?`}
        onChange={(isOpen) => handlePopUpToggle("removeDomain", isOpen)}
        onDeleteApproved={onRemoveDomain}
      />
      <EmailDomainVerificationModal
        popUp={popUp}
        handlePopUpClose={handlePopUpClose}
        handlePopUpToggle={handlePopUpToggle}
      />
    </div>
  );
};
