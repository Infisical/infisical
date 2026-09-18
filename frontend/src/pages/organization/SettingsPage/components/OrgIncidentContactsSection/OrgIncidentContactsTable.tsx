import { useState } from "react";
import { MoreHorizontal, Search, Trash2 } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { OrgPermissionActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import { usePopUp } from "@app/hooks";
import { useDeleteIncidentContact, useGetOrgIncidentContact } from "@app/hooks/api";

export const OrgIncidentContactsTable = () => {
  const { currentOrg } = useOrganization();
  const { data: contacts, isPending } = useGetOrgIncidentContact(currentOrg?.id ?? "");
  const [searchContact, setSearchContact] = useState("");
  const { handlePopUpToggle, popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "removeContact"
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
    ? contacts.filter(({ email }) => email.toLowerCase().includes(searchContact.toLowerCase()))
    : [];

  return (
    <div className="flex flex-col gap-4">
      <InputGroup>
        <InputGroupAddon>
          <Search />
        </InputGroupAddon>
        <InputGroupInput
          placeholder="Search incident contacts by email"
          value={searchContact}
          onChange={(e) => setSearchContact(e.target.value)}
        />
      </InputGroup>
      {!isPending && filteredContacts.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No incident contacts found</EmptyTitle>
            <EmptyDescription>
              Add an incident contact to be notified during severe incidents.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead className="w-px text-right" aria-label="Actions" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending &&
              Array.from({ length: 3 }).map((_, idx) => (
                // eslint-disable-next-line react/no-array-index-key
                <TableRow key={`incident-contact-skeleton-${idx}`}>
                  <TableCell colSpan={2}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {filteredContacts.map(({ email, id }) => (
              <TableRow key={id}>
                <TableCell className="font-medium text-foreground">{email}</TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <IconButton variant="ghost" size="xs" aria-label={`Actions for ${email}`}>
                        <MoreHorizontal />
                      </IconButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <OrgPermissionCan
                        I={OrgPermissionActions.Delete}
                        an={OrgPermissionSubjects.IncidentAccount}
                      >
                        {(isAllowed) => (
                          <DropdownMenuItem
                            variant="danger"
                            isDisabled={!isAllowed}
                            onClick={() => handlePopUpOpen("removeContact", { email, id })}
                          >
                            <Trash2 />
                            Delete
                          </DropdownMenuItem>
                        )}
                      </OrgPermissionCan>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <AlertDialog
        open={popUp.removeContact.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("removeContact", isOpen)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Trash2 />
            </AlertDialogMedia>
            <AlertDialogTitle>
              Remove &quot;{(popUp?.removeContact?.data as { email?: string })?.email}&quot;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This email will no longer be notified about severe incidents.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="danger" onClick={onRemoveIncidentContact}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
