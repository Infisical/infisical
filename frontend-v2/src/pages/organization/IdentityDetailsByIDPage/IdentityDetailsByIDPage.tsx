import { useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { faChevronLeft, faEllipsis } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
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
  Tooltip
} from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { OrgPermissionActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import {
  IdentityAuthMethod,
  useDeleteIdentity,
  useGetIdentityById,
  useRevokeIdentityTokenAuthToken,
  useRevokeIdentityUniversalAuthClientSecret
} from "@app/hooks/api";
import { Identity } from "@app/hooks/api/identities/types";
import { usePopUp } from "@app/hooks/usePopUp";
import { OrgAccessControlTabSections } from "@app/types/org";

import { IdentityAuthMethodModal } from "../AccessManagementPage/components/OrgIdentityTab/components/IdentitySection/IdentityAuthMethodModal";
import { IdentityModal } from "../AccessManagementPage/components/OrgIdentityTab/components/IdentitySection/IdentityModal";
import { IdentityUniversalAuthClientSecretModal } from "../AccessManagementPage/components/OrgIdentityTab/components/IdentitySection/IdentityUniversalAuthClientSecretModal";
import {
  IdentityAuthenticationSection,
  IdentityClientSecretModal,
  IdentityDetailsSection,
  IdentityProjectsSection,
  IdentityTokenListModal,
  IdentityTokenModal
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
  const { mutateAsync: revokeToken } = useRevokeIdentityTokenAuthToken();
  const { mutateAsync: revokeClientSecret } = useRevokeIdentityUniversalAuthClientSecret();

  const [selectedAuthMethod, setSelectedAuthMethod] = useState<
    Identity["authMethods"][number] | null
  >(null);

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "identity",
    "deleteIdentity",
    "identityAuthMethod",
    "revokeAuthMethod",
    "token",
    "tokenList",
    "revokeToken",
    "clientSecret",
    "revokeClientSecret",
    "universalAuthClientSecret", // list of client secrets
    "upgradePlan"
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

  const onRevokeTokenSubmit = async ({
    identityId: parentIdentityId,
    tokenId,
    name
  }: {
    identityId: string;
    tokenId: string;
    name: string;
  }) => {
    try {
      await revokeToken({
        identityId: parentIdentityId,
        tokenId
      });

      handlePopUpClose("revokeToken");

      createNotification({
        text: `Successfully revoked token ${name ?? ""}`,
        type: "success"
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

  const onDeleteClientSecretSubmit = async ({ clientSecretId }: { clientSecretId: string }) => {
    try {
      if (!data?.identity.id || selectedAuthMethod !== IdentityAuthMethod.UNIVERSAL_AUTH) return;

      await revokeClientSecret({
        identityId: data?.identity.id,
        clientSecretId
      });

      handlePopUpToggle("revokeClientSecret", false);

      createNotification({
        text: "Successfully deleted client secret",
        type: "success"
      });
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to delete client secret",
        type: "error"
      });
    }
  };

  return (
    <div className="container mx-auto flex flex-col justify-between bg-bunker-800 text-white">
      {data && (
        <div className="mx-auto mb-6 w-full max-w-7xl px-6 py-6">
          <Button
            variant="link"
            type="submit"
            leftIcon={<FontAwesomeIcon icon={faChevronLeft} />}
            onClick={() => {
              navigate({
                to: "/organization/access-management",
                search: {
                  selectedTab: OrgAccessControlTabSections.Identities
                }
              });
            }}
            className="mb-4"
          >
            Identities
          </Button>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-3xl font-semibold text-white">{data.identity.name}</p>
            <DropdownMenu>
              <DropdownMenuTrigger asChild className="rounded-lg">
                <div className="hover:text-primary-400 data-[state=open]:text-primary-400">
                  <Tooltip content="More options">
                    <FontAwesomeIcon size="sm" icon={faEllipsis} />
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
          </div>
          <div className="flex">
            <div className="mr-4 w-96">
              <IdentityDetailsSection identityId={identityId} handlePopUpOpen={handlePopUpOpen} />
              <IdentityAuthenticationSection
                selectedAuthMethod={selectedAuthMethod}
                setSelectedAuthMethod={setSelectedAuthMethod}
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
      <IdentityTokenModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <IdentityTokenListModal
        popUp={popUp}
        handlePopUpOpen={handlePopUpOpen}
        handlePopUpToggle={handlePopUpToggle}
      />
      <IdentityClientSecretModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <IdentityUniversalAuthClientSecretModal
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
      <DeleteActionModal
        isOpen={popUp.revokeToken.isOpen}
        title={`Are you sure want to revoke ${
          (popUp?.revokeToken?.data as { name: string })?.name || ""
        }?`}
        onChange={(isOpen) => handlePopUpToggle("revokeToken", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() => {
          const revokeTokenData = popUp?.revokeToken?.data as {
            identityId: string;
            tokenId: string;
            name: string;
          };

          return onRevokeTokenSubmit(revokeTokenData);
        }}
      />
      <DeleteActionModal
        isOpen={popUp.revokeClientSecret.isOpen}
        title={`Are you sure want to delete the client secret ${
          (popUp?.revokeClientSecret?.data as { clientSecretPrefix: string })?.clientSecretPrefix ||
          ""
        }************?`}
        onChange={(isOpen) => handlePopUpToggle("revokeClientSecret", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() => {
          const deleteClientSecretData = popUp?.revokeClientSecret?.data as {
            clientSecretId: string;
            clientSecretPrefix: string;
          };

          return onDeleteClientSecretSubmit({
            clientSecretId: deleteClientSecretData.clientSecretId
          });
        }}
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
