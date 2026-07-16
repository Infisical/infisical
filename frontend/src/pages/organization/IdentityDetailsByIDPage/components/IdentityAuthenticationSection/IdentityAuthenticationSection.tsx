import { PlusIcon } from "lucide-react";

import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle
} from "@app/components/v3";
import { OrgPermissionIdentityActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import { IdentityAuthMethod, useGetOrgIdentityMembershipById } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";
import { IdentityAuthMethodsTable } from "@app/views/IdentityAuthMethods";

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
    <Card>
      <CardHeader>
        <CardTitle>Authentication</CardTitle>
        <CardDescription>Configure authentication methods</CardDescription>
        {hasAuthMethods &&
          !Object.values(IdentityAuthMethod).every((method) =>
            data.identity.authMethods.includes(method)
          ) && (
            <CardAction>
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
            </CardAction>
          )}
      </CardHeader>
      <CardContent>
        {data.identity.authMethods.length > 0 ? (
          <IdentityAuthMethodsTable
            identityId={identityId}
            identityName={data.identity.name}
            authMethods={data.identity.authMethods}
            activeLockoutAuthMethods={data.identity.activeLockoutAuthMethods}
            onMutated={refetch}
          />
        ) : (
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>This machine identity has no auth methods configured</EmptyTitle>
              <EmptyDescription>Add an auth method to use this machine identity</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
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
            </EmptyContent>
          </Empty>
        )}
      </CardContent>
    </Card>
  ) : (
    <div />
  );
};
