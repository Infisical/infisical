import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button, Card, CardContent, CardHeader, CardTitle, Input } from "@app/components/v3";
import { LoginMethod } from "@app/hooks/api/admin/types";
import { useLastLogin } from "@app/hooks/useLastLogin";

import { LoginSection } from "../../Login.utils";

type Props = {
  setSection: (section: LoginSection) => void;
  type: "SAML" | "OIDC";
};

export const SSOStep = ({ setSection, type }: Props) => {
  const { lastLogin, saveLastLogin } = useLastLogin();
  const { t } = useTranslation();

  const matchingMethod = type === "SAML" ? LoginMethod.SAML : LoginMethod.OIDC;
  const initialEmail =
    lastLogin?.method === matchingMethod && lastLogin.orgSlug ? lastLogin.orgSlug : "";

  const [ssoEmail, setSSOEmail] = useState(initialEmail);

  const queryParams = new URLSearchParams(window.location.search);

  const handleSubmission = (e: React.FormEvent) => {
    e.preventDefault();

    // Extract domain from email (or use raw input if no @ present)
    const domain = ssoEmail.includes("@") ? ssoEmail.split("@")[1]?.trim() : ssoEmail.trim();
    if (!domain) return;

    const identifier = encodeURIComponent(domain);
    const callbackPort = queryParams.get("callback_port");

    saveLastLogin({ method: matchingMethod, orgSlug: ssoEmail });

    if (type === "SAML") {
      window.location.href = `/api/v1/sso/redirect/saml2/organizations/domain/${identifier}${
        callbackPort ? `?callback_port=${callbackPort}` : ""
      }`;
    } else {
      window.location.href = `/api/v1/sso/oidc/login?domain=${identifier}${
        callbackPort ? `&callbackPort=${callbackPort}` : ""
      }`;
    }
  };

  return (
    <form onSubmit={handleSubmission} className="mx-auto w-full max-w-sm">
      <Card className="w-full items-stretch gap-0 p-6">
        <CardHeader className="mb-4 gap-4">
          <CardTitle className="ml-0.5 bg-linear-to-b from-white to-bunker-200 bg-clip-text text-[1.35rem] font-medium text-transparent">
            What&apos;s your work email?
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="w-full">
            <Input
              value={ssoEmail}
              onChange={(e) => setSSOEmail(e.target.value)}
              type="email"
              placeholder="you@company.com"
              required
              className="h-10"
            />
          </div>
          <div className="mt-4 w-full">
            <Button type="submit" variant="project" size="lg" isFullWidth>
              Continue with {type}
            </Button>
          </div>
          <div className="mt-6 flex flex-row justify-center text-xs text-muted">
            <button onClick={() => setSection(LoginSection.Initial)} type="button">
              <span className="cursor-pointer duration-200 hover:text-label hover:underline hover:decoration-project/45 hover:underline-offset-2">
                {t("login.other-option")}
              </span>
            </button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
};
