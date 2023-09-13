import { useState } from "react";
import { faContactBook, faMagnifyingGlass, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
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
  Tr
} from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import { usePopUp } from "@app/hooks";
import { useDeleteIncidentContact, useGetOrgIncidentContact } from "@app/hooks/api";

export const OrgIncidentContactsTable = () => {
  const { createNotification } = useNotificationContext();
  const { currentOrg } = useOrganization();
  const { data: contacts, isLoading } = useGetOrgIncidentContact(currentOrg?._id ?? "");
  const [searchContact, setSearchContact] = useState("");
  const { handlePopUpToggle, popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "removeContact",
    "setUpEmail"
  ] as const);
  const { mutateAsync } = useDeleteIncidentContact();

  const onRemoveIncidentContact = async () => {
    try {
      const incidentContactEmail = (popUp?.removeContact?.data as { email: string })?.email;

      if (!currentOrg?._id) return;
      await mutateAsync({
        orgId: currentOrg._id,
        email: incidentContactEmail
      });

      createNotification({
        text: "Successfully removed incident contact",
        type: "success"
      });

      handlePopUpClose("removeContact");
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to remove incident contact",
        type: "error"
      });
    }
  };

  const filteredContacts = contacts
    ? contacts.filter(({ email }) => email.toLocaleLowerCase().includes(searchContact))
    : [];

  return (
    <div>
      <Input
        value={searchContact}
        onChange={(e) => setSearchContact(e.target.value)}
        leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
        placeholder="Search incident contact by email..."
      />
      <TableContainer className="mt-4">
        <Table>
          <THead>
            <Tr>
              <Th>Email</Th>
              <Th aria-label="actions" />
            </Tr>
          </THead>
          <TBody>
            {isLoading && <TableSkeleton columns={2} innerKey="incident-contact" />}
            {filteredContacts?.map(({ email }) => (
              <Tr key={email}>
                <Td className="w-full">{email}</Td>
                <Td className="mr-4">
                  <OrgPermissionCan
                    I={OrgPermissionActions.Delete}
                    an={OrgPermissionSubjects.IncidentAccount}
                  >
                    {(isAllowed) => (
                      <IconButton
                        ariaLabel="delete"
                        colorSchema="danger"
                        onClick={() => handlePopUpOpen("removeContact", { email })}
                        isDisabled={!isAllowed}
                      >
                        <FontAwesomeIcon icon={faTrash} />
                      </IconButton>
                    )}
                  </OrgPermissionCan>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
        {filteredContacts?.length === 0 && !isLoading && (
          <EmptyState title="No incident contacts found" icon={faContactBook} />
        )}
      </TableContainer>
      <DeleteActionModal
        isOpen={popUp.removeContact.isOpen}
        deleteKey="remove"
        title="Do you want to remove this email from incident contact?"
        onChange={(isOpen) => handlePopUpToggle("removeContact", isOpen)}
        onDeleteApproved={onRemoveIncidentContact}
      />
    </div>
  );
};
