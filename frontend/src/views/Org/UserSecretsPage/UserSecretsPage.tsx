import { useUser } from "@app/context";
import { useGetUserSecrets } from "@app/hooks/api/userSecrets";

import { CreditCardForm, SecureNoteForm, WebLoginForm } from "./components/forms";
import { SecretsTable } from "./components/SecretsTable";

export const UserSecretsPage = () => {
  const { user } = useUser();
  const { data, isLoading } = useGetUserSecrets({ userId: user.id });

  return (
    <div className="container flex flex-col gap-6 bg-bunker-800 p-6 text-white">
      <p className="text-3xl font-semibold text-bunker-100">User Secrets</p>

      <SecretsTable
        title="Web Login"
        data={data?.webLogins || []}
        headers={{ name: "Name", username: "Username", password: "Password" }}
        renderForm={({ onSubmit, formData }) => (
          <WebLoginForm userId={user.id} onSubmit={onSubmit} defaultValues={formData} />
        )}
        hiddenValue="password"
        loaderKey="web-logins"
        isLoading={isLoading}
      />

      <SecretsTable
        title="Credit Card"
        data={data?.creditCards || []}
        headers={{ name: "Name", cardNumber: "Card Number", expiryDate: "Expiry Date", cvv: "CVV" }}
        renderForm={({ onSubmit, formData }) => (
          <CreditCardForm userId={user.id} onSubmit={onSubmit} defaultValues={formData} />
        )}
        hiddenValue="cardNumber"
        loaderKey="credit-cards"
        isLoading={isLoading}
      />

      <SecretsTable
        title="Secure Note"
        data={data?.secureNotes || []}
        headers={{ name: "Title", content: "Content" }}
        renderForm={({ onSubmit, formData }) => (
          <SecureNoteForm userId={user.id} onSubmit={onSubmit} defaultValues={formData} />
        )}
        hiddenValue="content"
        loaderKey="secure-notes"
        isLoading={isLoading}
      />
    </div>
  );
};
