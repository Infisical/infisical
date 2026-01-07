import { format } from "date-fns";
import {
  BanIcon,
  CheckIcon,
  ClipboardListIcon,
  MailIcon,
  PencilIcon,
  UserCheckIcon,
  XIcon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { Tooltip } from "@app/components/v2";
import {
  Badge,
  Detail,
  DetailGroup,
  DetailLabel,
  DetailValue,
  UnstableButton,
  UnstableButtonGroup,
  UnstableCard,
  UnstableCardAction,
  UnstableCardContent,
  UnstableCardDescription,
  UnstableCardHeader,
  UnstableCardTitle,
  UnstableIconButton
} from "@app/components/v3";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrganization,
  useUser
} from "@app/context";
import { useTimedReset } from "@app/hooks";
import { useFetchServerStatus, useGetOrgMembership, useGetOrgRoles } from "@app/hooks/api";
import { OrgUser } from "@app/hooks/api/types";
import { useResendOrgMemberInvitation } from "@app/hooks/api/users/mutation";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  membershipId: string;
  handlePopUpOpen: (popUpName: keyof UsePopUpState<["orgMembership"]>, data?: object) => void;
};

export const UserDetailsSection = ({ membershipId, handlePopUpOpen }: Props) => {
  const [, isCopyingId, setCopyTextId] = useTimedReset<string>({
    initialState: "Copy ID to clipboard"
  });

  const [, isCopyingEmail, setCopyEmail] = useTimedReset<string>({
    initialState: "Copy email to clipboard"
  });

  const { user } = useUser();
  const { currentOrg, isSubOrganization } = useOrganization();
  const userId = user?.id || "";
  const orgId = currentOrg?.id || "";

  const { data: roles } = useGetOrgRoles(orgId);
  const { data: serverDetails } = useFetchServerStatus();
  const { data: membership } = useGetOrgMembership(orgId, membershipId);

  const { mutateAsync: resendOrgMemberInvitation, isPending } = useResendOrgMemberInvitation();

  const onResendInvite = async () => {
    const signupToken = await resendOrgMemberInvitation({
      membershipId
    });

    if (signupToken) {
      return;
    }

    createNotification({
      text: "Successfully resent org invitation",
      type: "success"
    });
  };

  const getStatus = (m: OrgUser) => {
    if (!m.isActive) {
      return { label: "Deactivated", variant: "neutral" as const, Icon: <BanIcon /> };
    }

    return m.status === "invited"
      ? { label: "Invited", variant: "info" as const, Icon: <MailIcon /> }
      : { label: "Active", variant: "success" as const, Icon: <UserCheckIcon /> };
  };

  const roleName = roles?.find(
    (r) => r.slug === membership?.role || r.slug === membership?.customRoleSlug
  )?.name;

  const name =
    membership?.user.firstName || membership?.user.lastName
      ? `${membership.user.firstName} ${membership.user.lastName ?? ""}`.trim()
      : null;

  const status = membership ? getStatus(membership) : null;

  return membership ? (
    <UnstableCard className="w-full lg:max-w-[24rem]">
      <UnstableCardHeader className="border-b">
        <UnstableCardTitle>Details</UnstableCardTitle>
        <UnstableCardDescription>User membership details</UnstableCardDescription>
        {userId !== membership.user.id && (
          <UnstableCardAction>
            <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Member}>
              {(isAllowed) => (
                <UnstableIconButton
                  isDisabled={!isAllowed}
                  onClick={() => {
                    handlePopUpOpen("orgMembership", {
                      membershipId: membership.id,
                      role: membership.role,
                      roleId: membership.roleId,
                      metadata: membership.metadata
                    });
                  }}
                  size="xs"
                  variant="outline"
                >
                  <PencilIcon />
                </UnstableIconButton>
              )}
            </OrgPermissionCan>
          </UnstableCardAction>
        )}
      </UnstableCardHeader>
      <UnstableCardContent>
        <DetailGroup>
          <Detail>
            <DetailLabel>Name</DetailLabel>
            <DetailValue>{name || <span className="text-muted">—</span>}</DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>ID</DetailLabel>
            <DetailValue className="flex items-center gap-x-1">
              {membership.user.id}
              <Tooltip content="Copy user ID to clipboard">
                <UnstableIconButton
                  onClick={() => {
                    navigator.clipboard.writeText(membership.user.id);
                    setCopyTextId("Copied");
                  }}
                  variant="ghost"
                  size="xs"
                >
                  {isCopyingId ? <CheckIcon /> : <ClipboardListIcon className="text-label" />}
                </UnstableIconButton>
              </Tooltip>
            </DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>Email</DetailLabel>
            <DetailValue className="flex flex-wrap items-center gap-1">
              {membership.user.email ? (
                <>
                  {membership.user.email}
                  <Tooltip
                    content={
                      membership.user.isEmailVerified
                        ? "Email has been verified"
                        : "Email has not been verified"
                    }
                  >
                    {membership.user.isEmailVerified ? (
                      <CheckIcon size={14} className="ml-0.5 shrink-0 text-success" />
                    ) : (
                      <XIcon size={14} className="ml-0.5 shrink-0 text-danger" />
                    )}
                  </Tooltip>
                  <Tooltip content="Copy user email to clipboard">
                    <UnstableIconButton
                      onClick={() => {
                        navigator.clipboard.writeText(membership.user.email!);
                        setCopyEmail("Copied");
                      }}
                      variant="ghost"
                      size="xs"
                    >
                      {isCopyingEmail ? (
                        <CheckIcon />
                      ) : (
                        <ClipboardListIcon className="text-label" />
                      )}
                    </UnstableIconButton>
                  </Tooltip>
                </>
              ) : (
                <span className="text-muted">—</span>
              )}
            </DetailValue>
          </Detail>
          {membership.user.username !== membership.user.email && (
            <Detail>
              <DetailLabel>Username</DetailLabel>
              <DetailValue>
                {membership.user.username || <span className="text-muted">—</span>}
              </DetailValue>
            </Detail>
          )}
          <Detail>
            <DetailLabel>Organization Role</DetailLabel>
            <DetailValue>{roleName ?? <span className="text-muted">—</span>}</DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>Status</DetailLabel>
            <DetailValue>
              {status && (
                <Badge variant={status.variant}>
                  {status.Icon}
                  {status.label}
                </Badge>
              )}
            </DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>Last Login Method</DetailLabel>
            <DetailValue>
              {membership.lastLoginAuthMethod || <span className="text-muted">—</span>}
            </DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>Last Logged In</DetailLabel>
            <DetailValue>
              {membership.lastLoginTime ? (
                format(membership.lastLoginTime, "PPpp")
              ) : (
                <span className="text-muted">—</span>
              )}
            </DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>Metadata</DetailLabel>
            <DetailValue className="flex flex-wrap gap-2">
              {membership?.metadata?.length ? (
                membership.metadata?.map((el) => (
                  <UnstableButtonGroup className="min-w-0" key={el.id}>
                    <Badge isTruncatable>
                      <span>{el.key}</span>
                    </Badge>
                    <Badge variant="outline" isTruncatable>
                      <span>{el.value}</span>
                    </Badge>
                  </UnstableButtonGroup>
                ))
              ) : (
                <span className="text-muted">—</span>
              )}
            </DetailValue>
          </Detail>
        </DetailGroup>
        {!isSubOrganization &&
          membership.isActive &&
          (membership.status === "invited" || membership.status === "verified") &&
          membership.user.email &&
          serverDetails?.emailConfigured && (
            <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Member}>
              {(isAllowed) => (
                <UnstableButton
                  isDisabled={!isAllowed}
                  className="mt-4 w-full"
                  variant="org"
                  isPending={isPending}
                  onClick={onResendInvite}
                >
                  Resend Invite
                </UnstableButton>
              )}
            </OrgPermissionCan>
          )}
      </UnstableCardContent>
    </UnstableCard>
  ) : (
    <div />
  );
};
