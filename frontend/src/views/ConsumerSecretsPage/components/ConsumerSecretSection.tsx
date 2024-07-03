// views/ConsumerSecretsPage.tsx
import React from "react";

import { ConsumerSecretList } from "./ConsumerSecretList";

export const ConsumerSecretSection = () => {
  return (
    <div className="flex">
        <ConsumerSecretList />
    </div>
  );
};

