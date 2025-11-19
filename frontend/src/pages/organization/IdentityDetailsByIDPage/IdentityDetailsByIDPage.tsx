import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { faChevronLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, useNavigate, useParams } from "@tanstack/react-router";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { Button, DeleteActionModal, Modal, ModalContent, PageHeader } from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import {
  OrgPermissionActions,
  OrgPermissionIdentityActions,
  OrgPermissionSubjects,
  useOrganization
} from "@app/context";
import { useDeleteOrgIdentity, useGetOrgIdentityMembershipById } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";
import { ViewIdentityAuthModal } from "@app/pages/organization/IdentityDetailsByIDPage/components/ViewIdentityAuthModal/ViewIdentityAuthModal";
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
  const { mutateAsync: deleteIdentity, isPending: isDeletingIdentity } = useDeleteOrgIdentity();
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
      text: "Successfully deleted identity",
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

  return (
    <div className="mx-auto flex flex-col justify-between bg-bunker-800 text-white">
      {data && (
        <div className="mx-auto w-full max-w-8xl">
          <Link
            to="/organizations/$orgId/access-management"
            params={{ orgId }}
            search={{
              selectedTab: OrgAccessControlTabSections.Identities
            }}
            className="mb-4 flex items-center gap-x-2 text-sm text-mineshaft-400"
          >
            <FontAwesomeIcon icon={faChevronLeft} />
            Identities
          </Link>
          <PageHeader
            scope={isSubOrganization ? "namespace" : "org"}
            description={`${isSubOrganization ? "Sub-" : ""}Organization Identity`}
            title={data.identity.name}
          >
            <div className="flex items-center gap-2">
              {isSubOrganization && data.identity.orgId !== currentOrg.id && (
                <OrgPermissionCan
                  I={OrgPermissionActions.Delete}
                  a={OrgPermissionSubjects.Identity}
                  renderTooltip
                  allowedLabel="Remove from sub-organization"
                >
                  {(isAllowed) => (
                    <Button
                      colorSchema="danger"
                      variant="outline_bg"
                      size="xs"
                      isDisabled={!isAllowed}
                      isLoading={isDeletingIdentity}
                      onClick={() =>
                        handlePopUpOpen("deleteIdentity", {
                          identityId: data.identity.id,
                          name: data.identity.name
                        })
                      }
                    >
                      Unlink Identity
                    </Button>
                  )}
                </OrgPermissionCan>
              )}
            </div>
          </PageHeader>
          <div className="flex flex-col gap-4 md:flex-row">
            <div className="w-full md:w-96">
              <IdentityDetailsSection
                isOrgIdentity={data.identity.orgId === currentOrg.id}
                identityId={identityId}
                handlePopUpOpen={handlePopUpOpen}
              />
              {!isAuthHidden && (
                <IdentityAuthenticationSection
                  identityId={identityId}
                  handlePopUpOpen={handlePopUpOpen}
                />
              )}
            </div>
            <IdentityProjectsSection identityId={identityId} />
          </div>
        </div>
      )}
      <Modal
        isOpen={popUp?.identity?.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("identity", isOpen)}
      >
        <ModalContent
          bodyClassName="overflow-visible"
          title={`${popUp?.identity?.data ? "Update" : "Create"} Identity`}
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
      <ViewIdentityAuthModal
        isOpen={popUp.viewAuthMethod.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("viewAuthMethod", isOpen)}
        authMethod={popUp.viewAuthMethod.data?.authMethod}
        lockedOut={popUp.viewAuthMethod.data?.lockedOut || false}
        identityId={identityId}
        onResetAllLockouts={popUp.viewAuthMethod.data?.refetchIdentity}
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
