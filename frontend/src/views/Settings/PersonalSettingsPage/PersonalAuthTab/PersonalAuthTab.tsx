import { useGetUser } from "@app/hooks/api";
import { AuthMethod } from "@app/hooks/api/users/types";

import { AuthMethodSection } from "../AuthMethodSection";
import { ChangePasswordSection } from "../ChangePasswordSection";
import { MFASection } from "../SecuritySection";

export const PersonalAuthTab = () => {
  const { data: user } = useGetUser();
  return (
    <div>
      {user && !user.authMethods.includes(AuthMethod.LDAP) && (
        <>
          <MFASection />
          <AuthMethodSection />
        </>
      )}
      <ChangePasswordSection />
    </div>
  );
};
