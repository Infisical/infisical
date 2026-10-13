import { useCallback } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";

import { AuthPageLayout } from "@app/components/auth/AuthPageLayout";
import { AuthPagePanel } from "@app/components/auth/AuthPagePanel";
import { createNotification } from "@app/components/notifications";
import {
  Button,
  DeleteConfirmDialog,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
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
  const logout = useLogoutUser();
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
    <>
      <AuthPageLayout variant="focused" showFooter={false} contentClassName="max-w-2xl">
        <Helmet>
          <title>{t("common.head-title", { title: t("login.title") })}</title>
          <link rel="icon" href="/infisical.ico" />
          <meta property="og:image" content="/images/message.png" />
          <meta property="og:title" content={t("login.og-title") ?? ""} />
          <meta name="og:description" content={t("login.og-description") ?? ""} />
        </Helmet>
        <AuthPagePanel>
          <form className="mx-auto flex w-full flex-col">
            <div className="mb-6">
              <h1 className="mb-2 font-alliance text-2xl font-normal text-foreground">
                Multiple Accounts Detected
              </h1>
              <p className="mb-4 text-sm text-label">
                <span>You&apos;re currently logged in as</span>{" "}
                <b>{duplicateAccounts?.data?.myAccount?.username}</b>.
              </p>
              <div className="mt-4 mb-4 flex flex-col rounded-r border-l-2 border-l-project bg-label/5 px-4 py-2.5">
                <p className="mt-1 mb-2 text-sm text-label-secondary">
                  We&apos;ve detected multiple accounts using variations of the same email address.
                </p>
              </div>
            </div>
            <div className="mb-4 w-full border-b border-border-emphasis pb-1 text-sm text-foreground-secondary">
              Your other accounts
            </div>
            <div className="flex h-full max-h-60 thin-scrollbar w-full flex-col items-stretch gap-2 overflow-auto rounded-md">
              {duplicateAccounts?.data?.duplicateAccounts?.map((el) => {
                const lastSession = el.devices?.at(-1);
                return (
                  <div
                    key={el.id}
                    className="flex items-center gap-8 rounded-md bg-surface-hover px-4 py-3 text-foreground-cool"
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
                      <Tooltip hoverable delayDuration={50}>
                        <TooltipTrigger asChild>
                          <FontAwesomeIcon icon={faInfoCircle} />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-lg">
                          <div className="flex flex-col space-y-1 text-sm">
                            <div>IP: {lastSession?.ip || "-"}</div>
                            <div>User Agent: {lastSession?.userAgent || "-"}</div>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex w-full flex-col">
              <div className="flex gap-6">
                <Button
                  variant="project"
                  size="lg"
                  className="flex-1 grow"
                  isPending={removeDuplicateEmails.isPending}
                  onClick={() => handlePopUpToggle("removeDuplicateConfirm", true)}
                >
                  Delete all other accounts
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => onRemoveDuplicateLater()}
                  className="flex-1 grow"
                >
                  Remind me later
                </Button>
              </div>
              <Button
                isPending={logout.isPending}
                variant="ghost"
                size="lg"
                className="mt-4"
                onClick={handleLogout}
              >
                Change Account
              </Button>
            </div>
          </form>
        </AuthPagePanel>
      </AuthPageLayout>
      <DeleteConfirmDialog
        isOpen={popUp.removeDuplicateConfirm.isOpen}
        description={`You’re currently logged in as ${duplicateAccounts?.data?.myAccount?.username}. Once you confirm, your other duplicate accounts will be permanently removed. Please make sure none of those accounts contain any production secrets, as this action cannot be undone.`}
        title="Confirmation Required"
        onOpenChange={(isOpen) => handlePopUpToggle("removeDuplicateConfirm", isOpen)}
        confirmKey="remove"
        confirmLabel="Confirm"
        onConfirm={() =>
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
    </>
  );
};
