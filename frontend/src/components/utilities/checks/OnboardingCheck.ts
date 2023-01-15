import getOrganizationUsers from '~/pages/api/organization/GetOrgUsers';
import checkUserAction from '~/pages/api/userActions/checkUserAction';

interface OnboardingCheckProps {
  setTotalOnboardingActionsDone?: (value: number) => void;
  setHasUserClickedSlack?: (value: boolean) => void;
  setHasUserClickedIntro?: (value: boolean) => void;
  setHasUserStarred?: (value: boolean) => void;
  setHasUserPushedSecrets?: (value: boolean) => void;
  setUsersInOrg?: (value: boolean) => void;
}

/**
 * This function checks which onboarding steps a user has already finished.
 */
const onboardingCheck = async ({
  setTotalOnboardingActionsDone,
  setHasUserClickedSlack,
  setHasUserClickedIntro,
  setHasUserStarred,
  setHasUserPushedSecrets,
  setUsersInOrg
}: OnboardingCheckProps) => {
  let countActions = 0;
  const userActionSlack = await checkUserAction({
    action: 'slack_cta_clicked'
  });
  if (userActionSlack) {
    countActions = countActions + 1;
  }
  setHasUserClickedSlack &&
    setHasUserClickedSlack(userActionSlack ? true : false);

  const userActionSecrets = await checkUserAction({
    action: 'first_time_secrets_pushed'
  });
  if (userActionSecrets) {
    countActions = countActions + 1;
  }
  setHasUserPushedSecrets &&
    setHasUserPushedSecrets(userActionSecrets ? true : false);

  const userActionIntro = await checkUserAction({
    action: 'intro_cta_clicked'
  });
  if (userActionIntro) {
    countActions = countActions + 1;
  }
  setHasUserClickedIntro &&
    setHasUserClickedIntro(userActionIntro ? true : false);

  const userActionStar = await checkUserAction({
    action: 'star_cta_clicked'
  });
  if (userActionStar) {
    countActions = countActions + 1;
  }
  setHasUserStarred && setHasUserStarred(userActionStar ? true : false);

  const orgId = localStorage.getItem('orgData.id');
  const orgUsers = await getOrganizationUsers({
    orgId: orgId ? orgId : ''
  });
  if (orgUsers.length > 1) {
    countActions = countActions + 1;
  }
  setUsersInOrg && setUsersInOrg(orgUsers.length > 1);
  setTotalOnboardingActionsDone && setTotalOnboardingActionsDone(countActions);
};

export default onboardingCheck;
