import { LoginUserSecretForm } from "./login/form";
import { UserSecretType } from "./types";

export const USER_SECRET_FORMS = [
  {
    type: UserSecretType.Login,
    form: LoginUserSecretForm
  }
];
