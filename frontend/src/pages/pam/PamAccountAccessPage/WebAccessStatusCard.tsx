import { ReactNode } from "react";
import { LucideIcon } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@app/components/v3";

type Props = {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  tone?: "pam" | "danger";
  overlay?: boolean;
  children?: ReactNode;
};

export const WebAccessStatusCard = ({
  icon: Icon,
  title,
  description,
  tone = "pam",
  overlay = false,
  children
}: Props) => (
  <div
    className={`flex items-center justify-center bg-background p-4 ${
      overlay ? "absolute inset-0 z-10" : "h-dvh w-screen"
    }`}
  >
    <Card className="w-full max-w-md">
      <CardHeader className="flex items-center gap-3">
        <Icon
          className={`size-6 shrink-0 ${tone === "danger" ? "text-danger" : "text-product-pam"}`}
        />
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle className="text-base">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
      </CardHeader>
      {children && <CardContent className="flex flex-col gap-3">{children}</CardContent>}
    </Card>
  </div>
);
