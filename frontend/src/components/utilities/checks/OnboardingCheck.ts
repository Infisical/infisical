import getOrganizationUsers from '@app/pages/api/organization/GetOrgUsers';
import checkUserAction from '@app/pages/api/userActions/checkUserAction';

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
    countActions += 1;
  }
  if (setHasUserClickedSlack) setHasUserClickedSlack(!!userActionSlack);

  const userActionSecrets = await checkUserAction({
    action: 'first_time_secrets_pushed'
  });
  if (userActionSecrets) {
    countActions += 1;
  }
  if (setHasUserPushedSecrets) setHasUserPushedSecrets(!!userActionSecrets);

  const userActionIntro = await checkUserAction({
    action: 'intro_cta_clicked'
  });
  if (userActionIntro) {
    countActions += 1;
  }
  if (setHasUserClickedIntro) setHasUserClickedIntro(!!userActionIntro);

  const userActionStar = await checkUserAction({
    action: 'star_cta_clicked'
  });
  if (userActionStar) {
    countActions += 1;
  }
  if (setHasUserStarred) setHasUserStarred(!!userActionStar);

  const orgId = localStorage.getItem('orgData.id');
  const orgUsers = await getOrganizationUsers({
    orgId: orgId || ''
  }) || [];
  if (orgUsers.length > 1) {
    countActions += 1;
  }
  if (setUsersInOrg) setUsersInOrg(orgUsers.length > 1);
  if (setTotalOnboardingActionsDone) setTotalOnboardingActionsDone(countActions);
};

export default onboardingCheck;
