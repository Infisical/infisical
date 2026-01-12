import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { ChevronLeftIcon, EllipsisIcon } from "lucide-react";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { DeleteActionModal, Modal, ModalContent, PageHeader } from "@app/components/v2";
import {
  OrgIcon,
  UnstableAlert,
  UnstableAlertDescription,
  UnstableAlertTitle,
  UnstableButton,
  UnstableCard,
  UnstableCardContent,
  UnstableCardDescription,
  UnstableCardHeader,
  UnstableCardTitle,
  UnstableDropdownMenu,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuItem,
  UnstableDropdownMenuTrigger
} from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import {
  OrgPermissionActions,
  OrgPermissionIdentityActions,
  OrgPermissionSubjects,
  useOrganization
} from "@app/context";
import { useDeleteOrgIdentity, useGetOrgIdentityMembershipById } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";
import { OrgAccessControlTabSections } from "@app/types/org";

import { IdentityAuthMethodModal } from "../AccessManagementPage/components/OrgIdentityTab/components/IdentitySection/IdentityAuthMethodModal";
import { OrgIdentityModal } from "../AccessManagementPage/components/OrgIdentityTab/components/IdentitySection/OrgIdentityModal";
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
  const { currentOrg, isSubOrganization } = useOrganization();
  const orgId = currentOrg?.id || "";
  const { data } = useGetOrgIdentityMembershipById(identityId);
  const { mutateAsync: deleteIdentity } = useDeleteOrgIdentity();
  const isAuthHidden = orgId !== data?.identity?.orgId;

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "identity",
    "deleteIdentity",
    "identityAuthMethod",
    "upgradePlan",
    "viewAuthMethod"
  ] as const);

  const onDeleteIdentitySubmit = async (id: string) => {
    await deleteIdentity({
      identityId: id,
      orgId
    });

    createNotification({
      text: "Successfully deleted machine identity",
      type: "success"
    });

    handlePopUpClose("deleteIdentity");
    navigate({
      to: "/organizations/$orgId/access-management" as const,
      params: { orgId },
      search: {
        selectedTab: OrgAccessControlTabSections.Identities
      }
    });
  };

  const isScopeIdentity = data?.identity.orgId === currentOrg.id;

  return (
    <div className="mx-auto flex max-w-8xl flex-col">
      {data && (
        <>
          <Link
            to="/organizations/$orgId/access-management"
            params={{ orgId }}
            search={{
              selectedTab: OrgAccessControlTabSections.Identities
            }}
            className="mb-4 flex w-fit items-center gap-x-1 text-sm text-mineshaft-400 transition duration-100 hover:text-mineshaft-400/80"
          >
            <ChevronLeftIcon size={16} />
            {isSubOrganization ? "Sub-" : ""}Organization Machine Identities
          </Link>
          <PageHeader
            scope={isSubOrganization ? "namespace" : "org"}
            description={`Configure and manage${isScopeIdentity ? " machine identity and " : " "}${isSubOrganization ? "sub-" : ""}organization access control`}
            title={data.identity.name}
          >
            <UnstableDropdownMenu>
              <UnstableDropdownMenuTrigger asChild>
                <UnstableButton variant="outline">
                  Options
                  <EllipsisIcon />
                </UnstableButton>
              </UnstableDropdownMenuTrigger>
              <UnstableDropdownMenuContent align="end">
                <UnstableDropdownMenuItem
                  onClick={() => {
                    navigator.clipboard.writeText(data.identity.id);
                    createNotification({
                      text: "Machine identity ID copied to clipboard",
                      type: "info"
                    });
                  }}
                >
                  Copy Machine Identity ID
                </UnstableDropdownMenuItem>
                <OrgPermissionCan
                  I={OrgPermissionActions.Delete}
                  a={OrgPermissionSubjects.Identity}
                >
                  {(isAllowed) => (
                    <UnstableDropdownMenuItem
                      variant="danger"
                      isDisabled={!isAllowed}
                      onClick={() =>
                        handlePopUpOpen("deleteIdentity", {
                          identityId: data.identity.id,
                          name: data.identity.name
                        })
                      }
                    >
                      {isScopeIdentity ? "Delete Machine Identity" : "Remove From Sub-Organization"}
                    </UnstableDropdownMenuItem>
                  )}
                </OrgPermissionCan>
              </UnstableDropdownMenuContent>
            </UnstableDropdownMenu>
          </PageHeader>
          <div className="flex flex-col gap-5 lg:flex-row">
            <IdentityDetailsSection
              isCurrentOrgIdentity={data.identity.orgId === currentOrg.id}
              identityId={identityId}
              handlePopUpOpen={handlePopUpOpen}
            />
            <div className="flex flex-1 flex-col gap-y-5">
              {isAuthHidden ? (
                <UnstableCard>
                  <UnstableCardHeader>
                    <UnstableCardTitle>Authentication</UnstableCardTitle>
                    <UnstableCardDescription>
                      Configure authentication methods
                    </UnstableCardDescription>
                  </UnstableCardHeader>
                  <UnstableCardContent>
                    <UnstableAlert variant="org">
                      <OrgIcon />
                      <UnstableAlertTitle>
                        Machine identity managed by organization
                      </UnstableAlertTitle>
                      <UnstableAlertDescription>
                        <p>
                          This machine identity&apos;s authentication methods are managed by your
                          organization. <br /> To make changes,{" "}
                          <OrgPermissionCan
                            I={OrgPermissionIdentityActions.Read}
                            an={OrgPermissionSubjects.Identity}
                          >
                            {(isAllowed) =>
                              isAllowed ? (
                                <Link
                                  to="/organizations/$orgId/identities/$identityId"
                                  className="inline-block cursor-pointer text-foreground underline underline-offset-2"
                                  params={{
                                    identityId,
                                    orgId: data.identity.orgId
                                  }}
                                >
                                  go to organization access control
                                </Link>
                              ) : null
                            }
                          </OrgPermissionCan>
                          .
                        </p>
                      </UnstableAlertDescription>
                    </UnstableAlert>
                  </UnstableCardContent>
                </UnstableCard>
              ) : (
                <IdentityAuthenticationSection
                  identityId={identityId}
                  handlePopUpOpen={handlePopUpOpen}
                />
              )}
              <IdentityProjectsSection identityId={identityId} />
            </div>
          </div>
        </>
      )}
      <Modal
        isOpen={popUp?.identity?.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("identity", isOpen)}
      >
        <ModalContent
          bodyClassName="overflow-visible"
          title={`${popUp?.identity?.data ? "Update" : "Create"} Machine Identity`}
        >
          <OrgIdentityModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
        </ModalContent>
      </Modal>
      <IdentityAuthMethodModal
        popUp={popUp}
        handlePopUpOpen={handlePopUpOpen}
        handlePopUpToggle={handlePopUpToggle}
      />
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text={`Your current plan does not include access to ${popUp.upgradePlan.data?.featureName}. To unlock this feature, please upgrade to Infisical ${popUp.upgradePlan.data?.isEnterpriseFeature ? "Enterprise" : "Pro"} plan.`}
        isEnterpriseFeature={popUp.upgradePlan.data?.isEnterpriseFeature}
      />
      <DeleteActionModal
        isOpen={popUp.deleteIdentity.isOpen}
        title={`Are you sure you want to delete ${
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
        I={OrgPermissionIdentityActions.Read}
        a={OrgPermissionSubjects.Identity}
      >
        <Page />
      </OrgPermissionCan>
    </>
  );
};
