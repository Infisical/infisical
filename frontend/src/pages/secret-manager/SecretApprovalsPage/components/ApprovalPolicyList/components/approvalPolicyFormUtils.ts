type TApprovalStep = {
  user: unknown[];
  group: unknown[];
};

export const getEmptyApprovalStepIndexes = (steps: TApprovalStep[] = []) =>
  steps.reduce<number[]>((emptyStepIndexes, step, index) => {
    if (!(step.user.length || step.group.length)) emptyStepIndexes.push(index);
    return emptyStepIndexes;
  }, []);
