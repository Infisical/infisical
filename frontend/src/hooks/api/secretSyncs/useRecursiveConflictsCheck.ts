import { SecretSync, useCheckRecursiveConflicts } from "@app/hooks/api/secretSyncs";

type UseRecursiveConflictsCheckProps = {
  destination: SecretSync;
  projectId: string;
  environment?: string;
  secretPath?: string;
  keySchema?: string;
  recursive: boolean;
};

export const useRecursiveConflictsCheck = ({
  destination,
  projectId,
  environment,
  secretPath,
  keySchema,
  recursive
}: UseRecursiveConflictsCheckProps) => {
  const shouldCheck = recursive && Boolean(environment) && Boolean(secretPath);

  const { data, isLoading, isSuccess, error } = useCheckRecursiveConflicts(
    destination,
    projectId,
    shouldCheck ? environment : undefined,
    shouldCheck ? secretPath : undefined,
    keySchema,
    {
      enabled: shouldCheck,
      staleTime: 0,
      gcTime: 0
    }
  );

  const conflicts = shouldCheck ? (data?.conflicts ?? []) : [];

  return {
    conflicts,
    isChecking: shouldCheck && isLoading,
    // True once a check has actually completed and found nothing, so the caller can render a
    // "no conflicts" success state distinct from "no check has run yet".
    isClear: shouldCheck && isSuccess && conflicts.length === 0,
    hasError: Boolean(error)
  };
};
