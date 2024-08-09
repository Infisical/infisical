import React from "react";

import { UserSecretsSection } from "./components";

export const UserSecretsPage = () => {
  return (
    <div className="container mx-auto h-full w-full max-w-7xl bg-bunker-800 px-6 text-white">
      <div className="flex items-center justify-between py-6">
        <div className="flex w-full flex-col">
          <h2 className="text-3xl font-semibold text-gray-200">User Secrets</h2>
          <p className="text-bunker-300">
            Manage your sensitive information securely, including web logins, credit card details,
            and personal notes.
          </p>
        </div>
      </div>
      <UserSecretsSection />
    </div>
  );
};
