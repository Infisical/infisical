import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { PageHeader } from "@app/components/v2";
import {
  OrgPermissionSecretShareAction,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { withPermission } from "@app/hoc";

import { SecretSharingSettingsTabGroup } from "./components";

export const SecretSharingSettingsPage = withPermission(
  () => {
    const { t } = useTranslation();

    return (
      <>
        <Helmet>
          <title>{t("common.head-title", { title: t("settings.org.title") })}</title>
        </Helmet>
        <div className="flex w-full justify-center bg-bunker-800 text-white">
          <div className="w-full max-w-7xl">
            <PageHeader title={t("settings.org.title")} />
            <SecretSharingSettingsTabGroup />
          </div>
        </div>
      </>
    );
  },
  {
    action: OrgPermissionSecretShareAction.ManageSettings,
    subject: OrgPermissionSubjects.SecretShare
  }
);
