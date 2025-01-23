import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "@tanstack/react-router";
import { twMerge } from "tailwind-merge";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
  DeleteActionModal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  PageHeader,
  Tooltip
} from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { OrgPermissionActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import { useDeleteIdentity, useGetIdentityById } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";
import { ViewIdentityAuthModal } from "@app/pages/organization/IdentityDetailsByIDPage/components/ViewIdentityAuthModal/ViewIdentityAuthModal";
import { OrgAccessControlTabSections } from "@app/types/org";

import { IdentityAuthMethodModal } from "../AccessManagementPage/components/OrgIdentityTab/components/IdentitySection/IdentityAuthMethodModal";
import { IdentityModal } from "../AccessManagementPage/components/OrgIdentityTab/components/IdentitySection/IdentityModal";
import {
  IdentityAuthenticationSection,
  IdentityDetailsSection,
  IdentityProjectsSection
} from "./components";

const Page = () => {
  const navigate = useNavigate();
  const params = useParams({
    from: ROUTE_PATHS.Organization.IdentityDetailsByIDPage.id
  });
  const identityId = params.identityId as string;
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || "";
  const { data } = useGetIdentityById(identityId);
  const { mutateAsync: deleteIdentity } = useDeleteIdentity();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "identity",
    "deleteIdentity",
    "identityAuthMethod",
    "upgradePlan",
    "viewAuthMethod"
  ] as const);

  const onDeleteIdentitySubmit = async (id: string) => {
    try {
      await deleteIdentity({
        identityId: id,
        organizationId: orgId
      });

      createNotification({
        text: "Successfully deleted identity",
        type: "success"
      });

      handlePopUpClose("deleteIdentity");
      navigate({
        to: "/organization/access-management",
        search: {
          selectedTab: OrgAccessControlTabSections.Identities
        }
      });
    } catch (err) {
      console.error(err);
      const error = err as any;
      const text = error?.response?.data?.message ?? "Failed to delete identity";

      createNotification({
        text,
        type: "error"
      });
    }
  };

  return (
    <div className="container mx-auto flex flex-col justify-between bg-bunker-800 text-white">
      {data && (
        <div className="mx-auto mb-6 w-full max-w-7xl">
          <PageHeader title={data.identity.name}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild className="rounded-lg">
                <div className="hover:text-primary-400 data-[state=open]:text-primary-400">
                  <Tooltip content="More options">
                    <Button variant="outline_bg">More</Button>
                  </Tooltip>
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="p-1">
                <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Identity}>
                  {(isAllowed) => (
                    <DropdownMenuItem
                      className={twMerge(
                        !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                      )}
                      onClick={async () => {
                        handlePopUpOpen("identity", {
                          identityId,
                          name: data.identity.name,
                          role: data.role,
                          customRole: data.customRole
                        });
                      }}
                      disabled={!isAllowed}
                    >
                      Edit Identity
                    </DropdownMenuItem>
                  )}
                </OrgPermissionCan>
                <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Identity}>
                  {(isAllowed) => (
                    <DropdownMenuItem
                      className={twMerge(
                        !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                      )}
                      onClick={async () => {
                        handlePopUpOpen("identityAuthMethod", {
                          identityId,
                          name: data.identity.name,
                          allAuthMethods: data.identity.authMethods
                        });
                      }}
                      disabled={!isAllowed}
                    >
                      Add new auth method
                    </DropdownMenuItem>
                  )}
                </OrgPermissionCan>
                <OrgPermissionCan
                  I={OrgPermissionActions.Delete}
                  a={OrgPermissionSubjects.Identity}
                >
                  {(isAllowed) => (
                    <DropdownMenuItem
                      className={twMerge(
                        isAllowed
                          ? "hover:!bg-red-500 hover:!text-white"
                          : "pointer-events-none cursor-not-allowed opacity-50"
                      )}
                      onClick={async () => {
                        handlePopUpOpen("deleteIdentity", {
                          identityId,
                          name: data.identity.name
                        });
                      }}
                      disabled={!isAllowed}
                    >
                      Delete Identity
                    </DropdownMenuItem>
                  )}
                </OrgPermissionCan>
              </DropdownMenuContent>
            </DropdownMenu>
          </PageHeader>
          <div className="flex">
            <div className="mr-4 w-96">
              <IdentityDetailsSection identityId={identityId} handlePopUpOpen={handlePopUpOpen} />
              <IdentityAuthenticationSection
                identityId={identityId}
                handlePopUpOpen={handlePopUpOpen}
              />
            </div>
            <IdentityProjectsSection identityId={identityId} />
          </div>
        </div>
      )}
      <IdentityModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <IdentityAuthMethodModal
        popUp={popUp}
        handlePopUpOpen={handlePopUpOpen}
        handlePopUpToggle={handlePopUpToggle}
      />
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text={(popUp.upgradePlan?.data as { description: string })?.description}
      />
      <DeleteActionModal
        isOpen={popUp.deleteIdentity.isOpen}
        title={`Are you sure want to delete ${
          (popUp?.deleteIdentity?.data as { name: string })?.name || ""
        }?`}
        onChange={(isOpen) => handlePopUpToggle("deleteIdentity", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() =>
          onDeleteIdentitySubmit(
            (popUp?.deleteIdentity?.data as { identityId: string })?.identityId
          )
        }
      />
      <ViewIdentityAuthModal
        isOpen={popUp.viewAuthMethod.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("viewAuthMethod", isOpen)}
        authMethod={popUp.viewAuthMethod.data}
        identityId={identityId}
        onEditAuthMethod={(authMethod) =>
          handlePopUpOpen("identityAuthMethod", {
            identityId,
            name: data?.identity.name,
            allAuthMethods: data?.identity.authMethods,
            authMethod
          })
        }
      />
    </div>
  );
};

export const IdentityDetailsByIDPage = () => {
  const { t } = useTranslation();
  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: t("settings.org.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <OrgPermissionCan
        passThrough={false}
        I={OrgPermissionActions.Read}
        a={OrgPermissionSubjects.Identity}
      >
        <Page />
      </OrgPermissionCan>
    </>
  );
};
