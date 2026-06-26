import { Alert, AlertDescription, AlertTitle } from "@app/components/v3";

export const PlatformManagedNoticeBanner = () => (
  <Alert variant="warning" className="mb-4">
    <AlertTitle>Platform Managed Credentials</AlertTitle>
    <AlertDescription>
      This App Connection&#39;s credentials are managed by Infisical and cannot be updated.
    </AlertDescription>
  </Alert>
);
