import { useState } from "react";
import { faContactBook, faMagnifyingGlass, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

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
  Tr
} from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import { usePopUp } from "@app/hooks";
import { useDeleteIncidentContact, useGetOrgIncidentContact } from "@app/hooks/api";

export const OrgIncidentContactsTable = () => {
  const { currentOrg } = useOrganization();
  const { data: contacts, isPending } = useGetOrgIncidentContact(currentOrg?.id ?? "");
  const [searchContact, setSearchContact] = useState("");
  const { handlePopUpToggle, popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "removeContact",
    "setUpEmail"
  ] as const);
  const { mutateAsync } = useDeleteIncidentContact();

  const onRemoveIncidentContact = async () => {
    const incidentContactId = (popUp?.removeContact?.data as { id: string })?.id;

    if (!currentOrg?.id) return;
    await mutateAsync({
      orgId: currentOrg.id,
      incidentContactId
    });

    createNotification({
      text: "Successfully removed incident contact",
      type: "success"
    });

    handlePopUpClose("removeContact");
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
            {isPending && <TableSkeleton columns={2} innerKey="incident-contact" />}
            {filteredContacts?.map(({ email, id }) => (
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
                        onClick={() => handlePopUpOpen("removeContact", { email, id })}
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
        {filteredContacts?.length === 0 && !isPending && (
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
