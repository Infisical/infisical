import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@app/components/v3";
import { ActiveInstancePicker } from "@app/layouts/PkiManagerLayout/components/ActiveInstancePicker";

export const OrgCertManagerTab = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Certificate Manager</CardTitle>
        <CardDescription>
          Pick which Certificate Manager instance the product launches into. API requests without a
          projectId resolve to the active instance.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ActiveInstancePicker />
      </CardContent>
    </Card>
  );
};
