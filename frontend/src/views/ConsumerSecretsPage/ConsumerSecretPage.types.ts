type ConsumerSecretTypes = "web_login" | "credit_card" | "private_note";

export interface WebLoginData {
  type: "web_login";
  url: string;
  username: string;
  password: string;
}

export interface CreditCardData {
  type: "credit_card";
  nameOnCard: string;
  cardNumber: string;
  validThrough: string;
  cvv: string;
}

export interface PrivateNoteData {
  type: "private_note";
  title: string;
  content: string;
}

export interface ConsumerSecret {
  id: string;
  name: string;
  type: ConsumerSecretTypes;
  data: WebLoginData | CreditCardData | PrivateNoteData;
}
