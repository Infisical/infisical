import { type ComponentProps, useState } from "react";

import { Button } from "@app/components/v4/ui/button";
import { Input } from "@app/components/v4/ui/input";

type Props = Omit<ComponentProps<typeof Input>, "type" | "trailing" | "size">;

const PASSWORD_PLACEHOLDER = "••••••••";

export const PasswordInput = ({ placeholder = PASSWORD_PLACEHOLDER, ...props }: Props) => {
  const [isVisible, setIsVisible] = useState(false);
  return (
    <Input
      {...props}
      placeholder={placeholder}
      size="lg"
      type={isVisible ? "text" : "password"}
      trailing={
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          iconOnly
          icon="eye"
          aria-label={isVisible ? "Hide password" : "Show password"}
          aria-pressed={isVisible}
          onClick={() => setIsVisible((current) => !current)}
        />
      }
    />
  );
};
