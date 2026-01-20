import { PlusIcon } from "lucide-react";

import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
  UnstableCard,
  UnstableCardAction,
  UnstableCardContent,
  UnstableCardDescription,
  UnstableCardHeader,
  UnstableCardTitle,
  UnstableEmpty,
  UnstableEmptyContent,
  UnstableEmptyDescription,
  UnstableEmptyHeader,
  UnstableEmptyTitle
} from "@app/components/v3";
import { OrgPermissionIdentityActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import { IdentityAuthMethod, useGetOrgIdentityMembershipById } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { ViewIdentityAuth } from "../ViewIdentityAuth";

type Props = {
  identityId: string;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["identityAuthMethod", "viewAuthMethod"]>,
    data?: object | IdentityAuthMethod
  ) => void;
};

export const IdentityAuthenticationSection = ({ identityId, handlePopUpOpen }: Props) => {
  const { data, refetch } = useGetOrgIdentityMembershipById(identityId);

  const { isSubOrganization } = useOrganization();

  const hasAuthMethods = Boolean(data?.identity.authMethods.length);

  return data ? (
    <UnstableCard>
      <UnstableCardHeader>
        <UnstableCardTitle>Authentication</UnstableCardTitle>
        <UnstableCardDescription>Configure authentication methods</UnstableCardDescription>
        {hasAuthMethods &&
          !Object.values(IdentityAuthMethod).every((method) =>
            data.identity.authMethods.includes(method)
          ) && (
            <UnstableCardAction>
              <OrgPermissionCan
                I={OrgPermissionIdentityActions.Edit}
                a={OrgPermissionSubjects.Identity}
              >
                {(isAllowed) => (
                  <Button
                    variant="outline"
                    isFullWidth
                    size="xs"
                    isDisabled={!isAllowed}
                    onClick={() => {
                      handlePopUpOpen("identityAuthMethod", {
                        identityId: data.identity.id,
                        name: data.identity.name,
                        allAuthMethods: data.identity.authMethods
                      });
                    }}
                  >
                    <PlusIcon />
                    Add Auth Method
                  </Button>
                )}
              </OrgPermissionCan>
            </UnstableCardAction>
          )}
      </UnstableCardHeader>
      <UnstableCardContent>
        {data.identity.authMethods.length > 0 ? (
          <ViewIdentityAuth
            activeLockoutAuthMethods={data.identity.activeLockoutAuthMethods}
            identityId={identityId}
            authMethods={data.identity.authMethods}
            onResetAllLockouts={refetch}
          />
        ) : (
          <UnstableEmpty className="border">
            <UnstableEmptyHeader>
              <UnstableEmptyTitle>
                This machine identity has no auth methods configured
              </UnstableEmptyTitle>
              <UnstableEmptyDescription>
                Add an auth method to use this machine identity
              </UnstableEmptyDescription>
            </UnstableEmptyHeader>
            <UnstableEmptyContent>
              <OrgPermissionCan
                I={OrgPermissionIdentityActions.Edit}
                a={OrgPermissionSubjects.Identity}
              >
                {(isAllowed) => (
                  <Button
                    variant={isSubOrganization ? "sub-org" : "org"}
                    size="xs"
                    isDisabled={!isAllowed}
                    onClick={() => {
                      handlePopUpOpen("identityAuthMethod", {
                        identityId,
                        name: data.identity.name,
                        allAuthMethods: data.identity.authMethods
                      });
                    }}
                  >
                    <PlusIcon />
                    Add Auth Method
                  </Button>
                )}
              </OrgPermissionCan>
            </UnstableEmptyContent>
          </UnstableEmpty>
        )}
      </UnstableCardContent>
    </UnstableCard>
  ) : (
    <div />
  );
};
