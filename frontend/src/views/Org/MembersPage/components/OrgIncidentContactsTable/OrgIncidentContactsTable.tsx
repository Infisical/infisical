import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  faContactBook,
  faMagnifyingGlass,
  faPlus,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";

import {
  Button,
  DeleteActionModal,
  EmailServiceSetupModal,
  EmptyState,
  FormControl,
  IconButton,
  Input,
  Modal,
  ModalContent,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { usePopUp } from "@app/hooks";
import { useFetchServerStatus } from "@app/hooks/api/serverDetails";
import { IncidentContact } from "@app/hooks/api/types";

type Props = {
  isLoading?: boolean;
  contacts?: IncidentContact[];
  onRemoveContact: (email: string) => Promise<void>;
  onAddContact: (email: string) => Promise<void>;
};

const addContactFormSchema = yup.object({
  email: yup.string().email().required().label("Email").trim()
});

type TAddContactForm = yup.InferType<typeof addContactFormSchema>;

export const OrgIncidentContactsTable = ({
  contacts = [],
  onAddContact,
  onRemoveContact,
  isLoading
}: Props) => {
  const [searchContact, setSearchContact] = useState("");
  const { data: serverDetails } = useFetchServerStatus();
  const { handlePopUpToggle, popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "addContact",
    "removeContact",
    "setUpEmail"
  ] as const);

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<TAddContactForm>({ resolver: yupResolver(addContactFormSchema) });

  const onAddIncidentContact = ({ email }: TAddContactForm) => {
    onAddContact(email);
    handlePopUpClose("addContact");
    reset();
  };

  const onRemoveIncidentContact = async () => {
    const incidentContactEmail = (popUp?.removeContact?.data as { email: string })?.email;
    await onRemoveContact(incidentContactEmail);
    handlePopUpClose("removeContact");
  };

  const filteredContacts = contacts.filter(({ email }) =>
    email.toLocaleLowerCase().includes(searchContact)
  );

  return (
    <div className="w-full">
      <div className="mb-4 flex">
        <div className="mr-4 flex-1">
          <Input
            value={searchContact}
            onChange={(e) => setSearchContact(e.target.value)}
            leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
            placeholder="Search incident contact by email..."
          />
        </div>
        <div>
          <Button
            leftIcon={<FontAwesomeIcon icon={faPlus} />}
            onClick={() => {
              if (serverDetails?.emailConfigured) {
                handlePopUpOpen("addContact");
              } else {
                handlePopUpOpen("setUpEmail");
              }
            }}
          >
            Add Contact
          </Button>
        </div>
      </div>
      <div>
        <TableContainer>
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
                    <IconButton
                      ariaLabel="delete"
                      colorSchema="danger"
                      onClick={() => handlePopUpOpen("removeContact", { email })}
                    >
                      <FontAwesomeIcon icon={faTrash} />
                    </IconButton>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
          {filteredContacts?.length === 0 && !isLoading && (
            <EmptyState title="No incident contacts found" icon={faContactBook} />
          )}
        </TableContainer>
      </div>
      <Modal
        isOpen={popUp?.addContact?.isOpen}
        onOpenChange={(isOpen) => {
          handlePopUpToggle("addContact", isOpen);
          reset();
        }}
      >
        <ModalContent
          title="Add an Incident Contact"
          subTitle="This contact will be notified in the unlikely event of a severe incident."
        >
          <form onSubmit={handleSubmit(onAddIncidentContact)}>
            <Controller
              control={control}
              defaultValue=""
              name="email"
              render={({ field, fieldState: { error } }) => (
                <FormControl label="Email" isError={Boolean(error)} errorText={error?.message}>
                  <Input {...field} />
                </FormControl>
              )}
            />
            <div className="mt-8 flex items-center">
              <Button
                className="mr-4"
                size="sm"
                type="submit"
                isLoading={isSubmitting}
                isDisabled={isSubmitting}
              >
                Add Incident Contact
              </Button>
              <Button
                colorSchema="secondary"
                variant="plain"
                onClick={() => handlePopUpClose("addContact")}
              >
                Cancel
              </Button>
            </div>
          </form>
        </ModalContent>
      </Modal>
      <DeleteActionModal
        isOpen={popUp.removeContact.isOpen}
        deleteKey="remove"
        title="Do you want to remove this email from incident contact?"
        onChange={(isOpen) => handlePopUpToggle("removeContact", isOpen)}
        onDeleteApproved={onRemoveIncidentContact}
      />
      <EmailServiceSetupModal
        isOpen={popUp.setUpEmail?.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("setUpEmail", isOpen)}
      />
    </div>
  );
};
