import { AlertCircleIcon } from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  Skeleton
} from "@app/components/v3";
import { useGetUser } from "@app/hooks/api";
import { AuthMethod } from "@app/hooks/api/users/types";

import { AuthMethodSection } from "../AuthMethodSection";
import { ChangeEmailSection } from "../ChangeEmailSection";
import { ChangePasswordSection } from "../ChangePasswordSection";
import { MFASection } from "../SecuritySection";

export const PersonalAuthTab = () => {
  const { data: user, isPending, isError, refetch } = useGetUser();

  if (isError) {
    return (
      <Alert variant="danger">
        <AlertCircleIcon />
        <AlertTitle>Authentication settings could not be loaded</AlertTitle>
        <AlertDescription>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (isPending || !user) {
    return (
      <Card aria-label="Loading authentication settings">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-24 w-full" />
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {!user.authMethods.includes(AuthMethod.LDAP) && (
        <>
          <MFASection />
          <AuthMethodSection />
        </>
      )}
      <ChangePasswordSection />
      {!user.authMethods.includes(AuthMethod.LDAP) && <ChangeEmailSection />}
    </div>
  );
};
