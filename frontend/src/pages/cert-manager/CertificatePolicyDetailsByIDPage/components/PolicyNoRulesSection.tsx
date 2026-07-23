import { ShieldOff } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@app/components/v3";

export const PolicyNoRulesSection = () => (
  <Card className="w-full">
    <CardHeader className="border-b">
      <CardTitle>No restrictions configured</CardTitle>
      <CardDescription>This policy does not enforce any constraints</CardDescription>
    </CardHeader>
    <CardContent>
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <ShieldOff className="size-8 text-muted" />
        <p className="max-w-md text-sm text-muted">
          Certificates issued under this policy can use any subject attributes, subject alternative
          names, algorithms, key usages, and validity period. Edit the policy to add restrictions.
        </p>
      </div>
    </CardContent>
  </Card>
);
