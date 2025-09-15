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
  Spinner,
  Tooltip
} from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { OrgPermissionIdentityGroupActions, OrgPermissionSubjects } from "@app/context";
import { useDeleteIdentityGroup, useGetIdentityGroupById } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { IdentityGroupCreateUpdateModal } from "./components/IdentityGroupCreateUpdateModal";
import { IdentityGroupDetailsSection } from "./components/IdentityGroupDetailsSection";
import { IdentityGroupIdentitiesSection } from "./components/IdentityGroupIdentitiesSection";

export enum TabSections {
  Member = "members",
  Groups = "groups",
  Roles = "roles",
  Identities = "identities",
  IdentityGroups = "identity-groups"
}

const Page = () => {
  const navigate = useNavigate();
  const params = useParams({
    from: ROUTE_PATHS.Organization.IdentityGroupDetailsByIDPage.id
  });
  const identityGroupId = params.identityGroupId as string;

  const { data, isPending } = useGetIdentityGroupById(identityGroupId);

  const { mutateAsync: deleteMutateAsync } = useDeleteIdentityGroup();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "identityGroupCreateUpdate",
    "deleteIdentityGroup",
    "upgradePlan"
  ] as const);

  const onDeleteIdentityGroupSubmit = async ({ name, id }: { name: string; id: string }) => {
    try {
      await deleteMutateAsync({
        id
      });
      createNotification({
        text: `Successfully deleted the ${name} identity group`,
        type: "success"
      });
      navigate({
        to: "/organization/access-management" as const,
        search: {
          selectedTab: TabSections.IdentityGroups
        }
      });
    } catch (err) {
      console.error(err);
      createNotification({
        text: `Failed to delete the ${name} identity group`,
        type: "error"
      });
    }

    handlePopUpClose("deleteIdentityGroup");
  };

  if (isPending) return <Spinner size="sm" className="ml-2 mt-2" />;

  return (
    <div className="container mx-auto flex flex-col justify-between bg-bunker-800 text-white">
      {data && (
        <div className="mx-auto mb-6 w-full max-w-7xl">
          <PageHeader title={data.identityGroup.name}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild className="rounded-lg">
                <div className="hover:text-primary-400 data-[state=open]:text-primary-400">
                  <Tooltip content="More options">
                    <Button variant="outline_bg">More</Button>
                  </Tooltip>
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="p-1">
                <OrgPermissionCan
                  I={OrgPermissionIdentityGroupActions.Edit}
                  a={OrgPermissionSubjects.IdentityGroups}
                >
                  {(isAllowed) => (
                    <DropdownMenuItem
                      className={twMerge(
                        !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                      )}
                      onClick={async () => {
                        handlePopUpOpen("identityGroupCreateUpdate", {
                          identityGroupId,
                          name: data.identityGroup.name,
                          slug: data.identityGroup.slug,
                          role: data.identityGroup.role
                        });
                      }}
                      disabled={!isAllowed}
                    >
                      Edit Identity Group
                    </DropdownMenuItem>
                  )}
                </OrgPermissionCan>
                <OrgPermissionCan
                  I={OrgPermissionIdentityGroupActions.Delete}
                  a={OrgPermissionSubjects.IdentityGroups}
                >
                  {(isAllowed) => (
                    <DropdownMenuItem
                      className={twMerge(
                        isAllowed
                          ? "hover:!bg-red-500 hover:!text-white"
                          : "pointer-events-none cursor-not-allowed opacity-50"
                      )}
                      onClick={async () => {
                        handlePopUpOpen("deleteIdentityGroup", {
                          id: identityGroupId,
                          name: data.identityGroup.name
                        });
                      }}
                      disabled={!isAllowed}
                    >
                      Delete Identity Group
                    </DropdownMenuItem>
                  )}
                </OrgPermissionCan>
              </DropdownMenuContent>
            </DropdownMenu>
          </PageHeader>
          <div className="flex">
            <div className="mr-4 w-96">
              <IdentityGroupDetailsSection
                identityGroupId={identityGroupId}
                handlePopUpOpen={handlePopUpOpen}
              />
            </div>
            <IdentityGroupIdentitiesSection
              identityGroupId={identityGroupId}
              identityGroupSlug={data.identityGroup.slug}
            />
          </div>
        </div>
      )}
      <IdentityGroupCreateUpdateModal
        popUp={popUp}
        handlePopUpClose={handlePopUpClose}
        handlePopUpToggle={handlePopUpToggle}
      />
      <DeleteActionModal
        isOpen={popUp.deleteIdentityGroup.isOpen}
        title={`Are you sure you want to delete the identity group named ${
          (popUp?.deleteIdentityGroup?.data as { name: string })?.name || ""
        }?`}
        onChange={(isOpen) => handlePopUpToggle("deleteIdentityGroup", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() =>
          onDeleteIdentityGroupSubmit(
            popUp?.deleteIdentityGroup?.data as { name: string; id: string }
          )
        }
      />
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text={(popUp.upgradePlan?.data as { description: string })?.description}
      />
    </div>
  );
};

export const IdentityGroupDetailsByIDPage = () => {
  const { t } = useTranslation();
  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: t("settings.org.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <OrgPermissionCan
        passThrough={false}
        I={OrgPermissionIdentityGroupActions.Read}
        a={OrgPermissionSubjects.IdentityGroups}
      >
        <Page />
      </OrgPermissionCan>
    </>
  );
};
