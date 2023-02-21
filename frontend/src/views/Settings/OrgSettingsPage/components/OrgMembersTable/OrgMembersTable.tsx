import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { faMagnifyingGlass, faPlus, faTrash } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';

import {
  Button,
  DeleteActionModal,
  FormControl,
  IconButton,
  Input,
  Modal,
  ModalContent,
  Select,
  SelectItem,
  Table,
  TableContainer,
  Tag,
  TBody,
  Td,
  Th,
  THead,
  Tr,
  UpgradePlanModal
} from '@app/components/v2';
import { usePopUp } from '@app/hooks';
import { OrgUser, Workspace } from '@app/hooks/api/types';

type Props = {
  members?: OrgUser[];
  workspaceMemberships?: Record<string, Workspace[]>;
  orgName: string;
  isMoreUserNotAllowed: boolean;
  onRemoveMember: (userId: string) => Promise<void>;
  onInviteMember: (email: string) => Promise<void>;
  onRoleChange: (membershipId: string, role: string) => Promise<void>;
  onGrantAccess: (userId: string, publicKey: string) => Promise<void>;
  // the current user id to block remove org button
  userId: string;
};

const addMemberFormSchema = yup.object({
  email: yup.string().email().required().label('Email').trim()
});

type TAddMemberForm = yup.InferType<typeof addMemberFormSchema>;

export const OrgMembersTable = ({
  members = [],
  workspaceMemberships = {},
  orgName,
  isMoreUserNotAllowed,
  onRemoveMember,
  onInviteMember,
  onGrantAccess,
  onRoleChange,
  userId
}: Props) => {
  const [searchMemberFilter, setSearchMemberFilter] = useState('');
  const { handlePopUpToggle, popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
    'addMember',
    'removeMember',
    'upgradePlan'
  ] as const);

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<TAddMemberForm>({ resolver: yupResolver(addMemberFormSchema) });

  const onAddMember = ({ email }: TAddMemberForm) => {
    onInviteMember(email);
    handlePopUpClose('addMember');
    reset();
  };

  const onRemoveOrgMemberApproved = async () => {
    const orgMembershipId = (popUp?.removeMember?.data as { id: string })?.id;
    await onRemoveMember(orgMembershipId);
    handlePopUpClose('removeMember');
  };

  const isIamOwner = useMemo(
    () => members.find(({ user }) => userId === user?._id)?.role === 'owner',
    [userId, members]
  );

  const filterdUser = useMemo(
    () =>
      members.filter(
        ({ user, inviteEmail }) =>
          user?.firstName?.toLowerCase().includes(searchMemberFilter) ||
          user?.lastName?.toLowerCase().includes(searchMemberFilter) ||
          user?.email?.toLowerCase().includes(searchMemberFilter) ||
          inviteEmail?.includes(searchMemberFilter)
      ),
    [members, searchMemberFilter]
  );

  return (
    <div className="w-full">
      <div className="mb-4 flex">
        <div className="mr-4 flex-1">
          <Input
            value={searchMemberFilter}
            onChange={(e) => setSearchMemberFilter(e.target.value)}
            leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
            placeholder="Search members..."
          />
        </div>
        <div>
          <Button
            leftIcon={<FontAwesomeIcon icon={faPlus} />}
            onClick={() => {
              if (isMoreUserNotAllowed) {
                handlePopUpOpen('upgradePlan');
              } else {
                handlePopUpOpen('addMember');
              }
            }}
          >
            Add Member
          </Button>
        </div>
      </div>
      <div>
        <TableContainer>
          <Table>
            <THead>
              <Tr>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Role</Th>
                <Th>Projects</Th>
                <Th aria-label="actions" />
              </Tr>
            </THead>
            <TBody>
              {filterdUser.map(({ user, inviteEmail, role, _id: orgMembershipId, status }) => {
                const name = user ? `${user.firstName} ${user.lastName}` : '-';
                const email = user?.email || inviteEmail;
                const userWs = workspaceMemberships?.[user?._id];

                return (
                  <Tr key={`org-membership-${orgMembershipId}`} className="w-full">
                    <Td>{name}</Td>
                    <Td>{email}</Td>
                    <Td>
                      {status === 'accepted' && (
                        <Select
                          defaultValue={role}
                          isDisabled={userId === user?._id}
                          className="w-full bg-mineshaft-600"
                          onValueChange={(selectedRole) =>
                            onRoleChange(orgMembershipId, selectedRole)
                          }
                        >
                          {(isIamOwner || role === 'owner') && (
                            <SelectItem value="owner">owner</SelectItem>
                          )}
                          <SelectItem value="admin">admin</SelectItem>
                          <SelectItem value="member">member</SelectItem>
                        </Select>
                      )}
                      {(status === 'invited' || status === 'verified') && (
                        <Button colorSchema="secondary" onClick={() => onInviteMember(email)}>
                          Resent Invite
                        </Button>
                      )}
                      {status === 'completed' && (
                        <Button
                          colorSchema="secondary"
                          onClick={() => onGrantAccess(user?._id, user?.publicKey)}
                        >
                          Grant Access
                        </Button>
                      )}
                    </Td>
                    <Td>
                      {userWs ? (
                        userWs?.map(({ name: wsName, _id }) => (
                          <Tag key={`user-${user._id}-workspace-${_id}`} className="my-1">
                            {wsName}
                          </Tag>
                        ))
                      ) : (
                        <Tag colorSchema="red">This user isn&apos;t part of any projects yet</Tag>
                      )}
                    </Td>
                    <Td>
                      {userId !== user?._id && <IconButton
                        ariaLabel="delete"
                        colorSchema="danger"
                        isDisabled={userId === user?._id}
                        onClick={() => handlePopUpOpen('removeMember', { id: orgMembershipId })}
                      >
                        <FontAwesomeIcon icon={faTrash} />
                      </IconButton>}
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
          {filterdUser.length === 0 && <tr className='bg-bunker-800 text-sm py-4 text-center text-bunker-400 w-full mx-auto flex justify-center'><td className='col-span-5'>No project members found</td></tr>}
        </TableContainer>
      </div>
      <Modal
        isOpen={popUp?.addMember?.isOpen}
        onOpenChange={(isOpen) => {
          handlePopUpToggle('addMember', isOpen);
          reset();
        }}
      >
        <ModalContent
          title={`Invite others to ${orgName}`}
          subTitle={
            <>
              An invite is specific to an email address and expires after 1 day.
              <br />
              For security reasons, you will need to separately add members to projects.
            </>
          }
        >
          <form onSubmit={handleSubmit(onAddMember)}>
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
                Add Member
              </Button>
              <Button
                colorSchema="secondary"
                variant="plain"
                onClick={() => handlePopUpClose('addMember')}
              >
                Cancel
              </Button>
            </div>
          </form>
        </ModalContent>
      </Modal>
      <DeleteActionModal
        isOpen={popUp.removeMember.isOpen}
        deleteKey="remove"
        title="Do you want to remove this user from the org?"
        onChange={(isOpen) => handlePopUpToggle('removeMember', isOpen)}
        onDeleteApproved={onRemoveOrgMemberApproved}
      />
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle('upgradePlan', isOpen)}
        text="You can add custom environments if you switch to Infisical's Team plan."
      />
    </div>
  );
};
