export enum ConsumerSecretType {
    WebLogin = "web_login",
    CreditCard = "credit_card",
    PrivateNote = "private_note"
  }
  
  interface BaseConsumerSecret {
    type: ConsumerSecretType;
  }
  
  export interface TConsumerSecretWebLogin extends BaseConsumerSecret {
    type: ConsumerSecretType.WebLogin;
    url: string;
    username: string;
    password: string;
  }
  
  export interface TConsumerSecretCreditCard extends BaseConsumerSecret {
    type: ConsumerSecretType.CreditCard;
    nameOnCard: string;
    cardNumber: string;
    validThrough: string;
    cvv: string;
  }
  
  export interface TConsumerSecretPrivateNote extends BaseConsumerSecret {
    type: ConsumerSecretType.PrivateNote;
    title: string;
    content: string;
  }
  
  export type ConsumerSecretTypeUnion =
    | TConsumerSecretWebLogin
    | TConsumerSecretCreditCard
    | TConsumerSecretPrivateNote;
  
  export interface TConsumerSecret {
    id: string;
    name: string;
    type: ConsumerSecretType;
    data: ConsumerSecretTypeUnion;
  }
  
  export interface TCreateConsumerSecretDTO {
    name: string;
    data: ConsumerSecretTypeUnion;
  }
  
  export interface TUpdateConsumerSecretDTO {
    id: string;
    name?: string;
    data?: ConsumerSecretTypeUnion;
  }
  
  export interface TDeleteConsumerSecretDTO {
    id: string;
  }
  