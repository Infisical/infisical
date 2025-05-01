import { useCallback, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";

import { createNotification } from "@app/components/notifications";
import { Alert, Button, Spinner, Tooltip } from "@app/components/v2";
import {
  useGetMyDuplicateAccount,
  useLogoutUser,
  useRemoveMyDuplicateAccounts
} from "@app/hooks/api";

import { SelectOrganizationSection } from "./SelectOrgSection";

const LoadingScreen = () => {
  return (
    <div className="flex max-h-screen min-h-screen flex-col items-center justify-center gap-2 overflow-y-auto bg-gradient-to-tr from-mineshaft-600 via-mineshaft-800 to-bunker-700">
      <Spinner />
      <p className="text-white opacity-80">Loading, please wait</p>
    </div>
  );
};

export const SelectOrganizationPage = () => {
  const duplicateAccounts = useGetMyDuplicateAccount();
  const removeDuplicateEmails = useRemoveMyDuplicateAccounts();
  const [removeDuplicateLater, setRemoveDuplicateLater] = useState(false);
  const { t } = useTranslation();
  const navigate = useNavigate();
  const logout = useLogoutUser(true);
  const handleLogout = useCallback(async () => {
    try {
      console.log("Logging out...");
      await logout.mutateAsync();
      navigate({ to: "/login" });
    } catch (error) {
      console.error(error);
    }
  }, [logout, navigate]);

  if (duplicateAccounts.isPending) {
    return <LoadingScreen />;
  }

  if (!duplicateAccounts.data?.duplicateAccounts?.length || removeDuplicateLater) {
    return <SelectOrganizationSection />;
  }

  return (
    <div className="flex max-h-screen min-h-screen flex-col justify-center overflow-y-auto bg-gradient-to-tr from-mineshaft-600 via-mineshaft-800 to-bunker-700">
      <Helmet>
        <title>{t("common.head-title", { title: t("login.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content={t("login.og-title") ?? ""} />
        <meta name="og:description" content={t("login.og-description") ?? ""} />
      </Helmet>
      <div className="mx-auto mt-20 w-fit max-w-2xl rounded-lg border-2 border-mineshaft-500 p-10 shadow-lg">
        <Link to="/">
          <div className="mb-4 flex justify-center">
            <img
              src="/images/gradientLogo.svg"
              style={{
                height: "90px",
                width: "120px"
              }}
              alt="Infisical logo"
            />
          </div>
        </Link>
        <form className="mx-auto flex w-full flex-col items-center justify-center">
          <div className="mb-6">
            <h1 className="mb-2 bg-gradient-to-b from-white to-bunker-200 bg-clip-text text-center text-2xl font-medium text-transparent">
              Multiple Accounts Detected
            </h1>
            <p className="text-md mb-4 text-center text-white">
              <span className="text-slate-300">Your current account is: </span>{" "}
              <b>{duplicateAccounts?.data?.myAccount?.username}</b>.
            </p>
            <Alert variant="warning" hideTitle>
              We&apos;ve detected multiple accounts using variations of the same email address.
              Please confirm that this account, {duplicateAccounts?.data?.myAccount?.username}, is
              the account you wish to retain.
            </Alert>
          </div>
          <div className="thin-scrollbar flex h-full max-h-60 w-full flex-col items-stretch gap-2 overflow-auto rounded-md">
            {duplicateAccounts?.data?.duplicateAccounts?.map((el) => {
              const lastSession = el.devices?.at(-1);
              return (
                <div
                  key={el.id}
                  className="flex items-center gap-8 rounded-md bg-mineshaft-700 px-4 py-3 text-gray-200"
                >
                  <div className="group flex flex-grow flex-col">
                    <div className="truncate text-sm transition-colors">{el.username}</div>
                    <div className="mt-2 text-xs">
                      Last login: {format(new Date(el.updatedAt), "Pp")}
                    </div>
                  </div>
                  <div>
                    <Tooltip
                      className="max-w-lg"
                      content={
                        <div className="flex flex-col space-y-1 text-sm">
                          <div>IP: {lastSession?.ip || "-"}</div>
                          <div>User Agent: {lastSession?.userAgent || "-"}</div>
                        </div>
                      }
                    >
                      <FontAwesomeIcon icon={faInfoCircle} />
                    </Tooltip>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex w-full flex-col">
            <div className="flex gap-6">
              <Button
                className="flex-grow"
                isLoading={removeDuplicateEmails.isPending}
                onClick={() =>
                  removeDuplicateEmails.mutate(undefined, {
                    onSuccess: () => {
                      createNotification({
                        type: "info",
                        text: "Removed duplicate accounts"
                      });
                      setRemoveDuplicateLater(true);
                    }
                  })
                }
              >
                Confirm
              </Button>
              <Button
                variant="outline_bg"
                onClick={() => setRemoveDuplicateLater(true)}
                className="flex-grow"
              >
                Do This Later
              </Button>
            </div>
            <Button
              isLoading={logout.isPending}
              variant="plain"
              colorSchema="secondary"
              className="mt-4"
              onClick={handleLogout}
            >
              Change account
            </Button>
          </div>
        </form>
      </div>
      <div className="pb-28" />
    </div>
  );
};
