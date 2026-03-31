import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  Button,
  UnstableCard,
  UnstableCardContent,
  UnstableCardHeader,
  UnstableCardTitle,
  UnstableInput
} from "@app/components/v3";
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
  const initialSlug =
    lastLogin?.method === matchingMethod && lastLogin.orgSlug ? lastLogin.orgSlug : "";

  const [ssoIdentifier, setSSOIdentifier] = useState(initialSlug);

  const queryParams = new URLSearchParams(window.location.search);

  const handleSubmission = (e: React.FormEvent) => {
    e.preventDefault();
    const callbackPort = queryParams.get("callback_port");
    if (type === "SAML") {
      saveLastLogin({ method: LoginMethod.SAML, orgSlug: ssoIdentifier });
      window.open(
        `/api/v1/sso/redirect/saml2/organizations/${ssoIdentifier}${
          callbackPort ? `?callback_port=${callbackPort}` : ""
        }`
      );
    } else {
      saveLastLogin({ method: LoginMethod.OIDC, orgSlug: ssoIdentifier });
      window.open(
        `/api/v1/sso/oidc/login?orgSlug=${ssoIdentifier}${
          callbackPort ? `&callbackPort=${callbackPort}` : ""
        }`
      );
    }

    window.close();
  };

  return (
    <form onSubmit={handleSubmission} className="mx-auto w-full max-w-sm">
      <UnstableCard className="w-full items-stretch gap-0 p-6">
        <UnstableCardHeader className="mb-4 gap-4">
          <UnstableCardTitle className="ml-0.5 bg-linear-to-b from-white to-bunker-200 bg-clip-text text-[1.35rem] font-medium text-transparent">
            What&apos;s your organization slug?
          </UnstableCardTitle>
        </UnstableCardHeader>
        <UnstableCardContent>
          <div className="w-full">
            <UnstableInput
              value={ssoIdentifier}
              onChange={(e) => setSSOIdentifier(e.target.value)}
              type="text"
              placeholder="acme-123"
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
        </UnstableCardContent>
      </UnstableCard>
    </form>
  );
};
