import { CreditCardForm, SecureNoteForm, WebLoginForm } from "./components/forms";
import { SecretsTable } from "./components/SecretsTable";

const webLogins = [
  {
    id: "ce12d0a8-1e89-4f48-bc5a-3a36dda05fdf",
    name: "google",
    username: "user1",
    password: "password"
  },
  {
    id: "d6fac21d-f6f9-4a8d-92ce-fb6e99a12b0d",
    name: "my computer",
    username: "user2",
    password: "hunter2"
  },
  {
    id: "3f371341-1459-4f71-b4bb-f39f86b1bb42",
    name: "my secret place",
    username: "user3",
    password: "12345"
  }
];

const creditCards = [
  {
    id: "a0a56b06-acca-4c63-b269-6fa8aded69be",
    name: "visa",
    cardNumber: "1234567890",
    expiryDate: "11/25",
    cvv: "123"
  },
  {
    id: "8467f6a7-a3ab-4096-8868-f878b436d596",
    name: "stolen card",
    cardNumber: "9876543210",
    expiryDate: "1/30",
    cvv: "321"
  }
];

const secureNotes = [
  {
    id: "b9162dd1-8e9f-45fa-a3dd-28927aeeb2ca",
    name: "Note 1",
    content: "hello there"
  },
  {
    id: "5d3c1b99-802f-43ca-bb92-df683083ffff",
    name: "Note 2",
    content: "goodbye"
  }
];

export const UserSecretsPage = () => {
  return (
    <div className="container flex flex-col gap-6 bg-bunker-800 p-6 text-white">
      <p className="text-3xl font-semibold text-bunker-100">User Secrets</p>

      <SecretsTable
        title="Web Login"
        data={webLogins}
        headers={{ name: "Name", username: "Username", password: "Password" }}
        renderForm={(existingWebLogin) => <WebLoginForm defaultValues={existingWebLogin} />}
      />

      <SecretsTable
        title="Credit Card"
        data={creditCards}
        headers={{ name: "Name", cardNumber: "Card Number", expiryDate: "Expiry Date", cvv: "CVV" }}
        renderForm={(existingCreditCard) => <CreditCardForm defaultValues={existingCreditCard} />}
      />

      <SecretsTable
        title="Secure Note"
        data={secureNotes}
        headers={{ name: "Title", content: "Content" }}
        renderForm={(existingSecureNote) => <SecureNoteForm defaultValues={existingSecureNote} />}
      />
    </div>
  );
};
