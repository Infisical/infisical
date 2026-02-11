import { useCallback } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";

import { createNotification } from "@app/components/notifications";
import { Button, DeleteActionModal, Tooltip } from "@app/components/v2";
import { usePopUp } from "@app/hooks";
import {
  useGetMyDuplicateAccount,
  useLogoutUser,
  useRemoveMyDuplicateAccounts
} from "@app/hooks/api";

type Props = {
  onRemoveDuplicateLater: () => void;
};

export const EmailDuplicationConfirmation = ({ onRemoveDuplicateLater }: Props) => {
  const duplicateAccounts = useGetMyDuplicateAccount();
  const removeDuplicateEmails = useRemoveMyDuplicateAccounts();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const logout = useLogoutUser(true);
  const { popUp, handlePopUpToggle } = usePopUp(["removeDuplicateConfirm"] as const);
  const handleLogout = useCallback(async () => {
    try {
      console.log("Logging out...");
      await logout.mutateAsync();
      navigate({ to: "/login" });
    } catch (error) {
      console.error(error);
    }
  }, [logout, navigate]);

  return (
    <div className="flex min-h-screen flex-col justify-center overflow-y-auto bg-linear-to-tr from-mineshaft-600 via-mineshaft-800 to-bunker-700">
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
            <h1 className="mb-2 bg-linear-to-b from-white to-bunker-200 bg-clip-text text-center text-2xl font-medium text-transparent">
              Multiple Accounts Detected
            </h1>
            <p className="text-md mb-4 text-center text-white">
              <span className="text-slate-300">You&apos;re currently logged in as</span>{" "}
              <b>{duplicateAccounts?.data?.myAccount?.username}</b>.
            </p>
            <div className="mt-4 mb-4 flex flex-col rounded-r border-l-2 border-l-primary bg-mineshaft-300/5 px-4 py-2.5">
              <p className="mt-1 mb-2 text-sm text-bunker-300">
                We&apos;ve detected multiple accounts using variations of the same email address.
              </p>
            </div>
          </div>
          <div className="mb-4 w-full border-b border-mineshaft-400 pb-1 text-sm text-mineshaft-200">
            Your other accounts
          </div>
          <div className="flex h-full max-h-60 thin-scrollbar w-full flex-col items-stretch gap-2 overflow-auto rounded-md">
            {duplicateAccounts?.data?.duplicateAccounts?.map((el) => {
              const lastSession = el.devices?.at(-1);
              return (
                <div
                  key={el.id}
                  className="flex items-center gap-8 rounded-md bg-mineshaft-700 px-4 py-3 text-gray-200"
                >
                  <div className="group flex grow flex-col">
                    <div className="truncate text-sm transition-colors">{el.username}</div>
                    <div className="mt-2 text-xs">
                      Last logged in at {format(new Date(el.updatedAt), "Pp")}
                    </div>
                    <div className="mt-2 text-xs">
                      Organizations: {el?.organizations?.map((i) => i.slug)?.join(",")}
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
                className="flex-1 grow"
                isLoading={removeDuplicateEmails.isPending}
                onClick={() => handlePopUpToggle("removeDuplicateConfirm", true)}
              >
                Delete all other accounts
              </Button>
              <Button
                variant="outline_bg"
                onClick={() => onRemoveDuplicateLater()}
                className="flex-1 grow"
              >
                Remind me later
              </Button>
            </div>
            <Button
              isLoading={logout.isPending}
              variant="plain"
              colorSchema="secondary"
              className="mt-4"
              onClick={handleLogout}
            >
              Change Account
            </Button>
          </div>
        </form>
      </div>
      <div className="pb-28" />
      <DeleteActionModal
        isOpen={popUp.removeDuplicateConfirm.isOpen}
        subTitle={`You’re currently logged in as ${duplicateAccounts?.data?.myAccount?.username}. Once you confirm, your other duplicate accounts will be permanently removed. Please make sure none of those accounts contain any production secrets, as this action cannot be undone.`}
        title="Confirmation Required"
        onChange={(isOpen) => handlePopUpToggle("removeDuplicateConfirm", isOpen)}
        deleteKey="remove"
        buttonText="Confirm"
        onDeleteApproved={() =>
          removeDuplicateEmails.mutateAsync(undefined, {
            onSuccess: () => {
              createNotification({
                type: "success",
                text: "Removed duplicate accounts"
              });
              onRemoveDuplicateLater();
            }
          })
        }
      />
    </div>
  );
};
