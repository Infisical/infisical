import { fetchOrgUsers, fetchUserAction } from "@app/hooks/api/users/queries";

interface OnboardingCheckProps {
  orgId: string;
  setTotalOnboardingActionsDone?: (value: number) => void;
  setHasUserClickedSlack?: (value: boolean) => void;
  setHasUserClickedIntro?: (value: boolean) => void;
  setHasUserPushedSecrets?: (value: boolean) => void;
  setUsersInOrg?: (value: boolean) => void;
}

/**
 * This function checks which onboarding steps a user has already finished.
 */
const onboardingCheck = async ({
  orgId,
  setTotalOnboardingActionsDone,
  setHasUserClickedSlack,
  setHasUserClickedIntro,
  setHasUserPushedSecrets,
  setUsersInOrg
}: OnboardingCheckProps) => {
  let countActions = 0;
  const userActionSlack = await fetchUserAction("slack_cta_clicked");

  if (userActionSlack) {
    countActions += 1;
  }
  if (setHasUserClickedSlack) setHasUserClickedSlack(!!userActionSlack);

  const userActionSecrets = await fetchUserAction("first_time_secrets_pushed");

  if (userActionSecrets) {
    countActions += 1;
  }
  if (setHasUserPushedSecrets) setHasUserPushedSecrets(!!userActionSecrets);

  const userActionIntro = await fetchUserAction("intro_cta_clicked");
  if (userActionIntro) {
    countActions += 1;
  }
  if (setHasUserClickedIntro) setHasUserClickedIntro(!!userActionIntro);

  const orgUsers = await fetchOrgUsers(orgId || "");

  if (orgUsers.length > 1) {
    countActions += 1;
  }
  if (setUsersInOrg) setUsersInOrg(orgUsers.length > 1);
  if (setTotalOnboardingActionsDone) setTotalOnboardingActionsDone(countActions);
};

export default onboardingCheck;
