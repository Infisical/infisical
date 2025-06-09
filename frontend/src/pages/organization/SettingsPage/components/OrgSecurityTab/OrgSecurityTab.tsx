import { Link } from "@tanstack/react-router";

import { NoticeBannerV2 } from "@app/components/v2/NoticeBannerV2/NoticeBannerV2";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/context";
import { withPermission } from "@app/hoc";

import { OrgGenericAuthSection } from "./OrgGenericAuthSection";
import { OrgUserAccessTokenLimitSection } from "./OrgUserAccessTokenLimitSection";

export const OrgSecurityTab = withPermission(
  () => {
    return (
      <>
        <NoticeBannerV2
          className="mx-auto mb-4"
          titleClassName="text-base"
          title="Single Sign-On (SSO) Settings"
        >
          <p className="mt-1 text-mineshaft-300">
            SSO Settings have been relocated:{" "}
            <Link
              className="text-mineshaft-200 underline underline-offset-2"
              to="/organization/sso"
            >
              Click here to view SSO Settings
            </Link>
          </p>
        </NoticeBannerV2>
        <OrgGenericAuthSection />
        <OrgUserAccessTokenLimitSection />
      </>
    );
  },
  { action: OrgPermissionActions.Read, subject: OrgPermissionSubjects.Sso }
);
