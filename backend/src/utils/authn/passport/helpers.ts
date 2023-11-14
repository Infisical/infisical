import { AuthMethod, User } from "../../../models";
import { createToken } from "../../../helpers/auth";
import { AuthTokenType } from "../../../variables";
import { getAuthSecret, getJwtProviderAuthLifetime } from "../../../config";
import { getServerConfig } from "../../../config/serverConfig";

interface SSOUserTokenFlowParams {
  email: string;
  firstName: string;
  lastName: string;
  authMethod: AuthMethod;
  callbackPort?: string;
}

export const handleSSOUserTokenFlow = async ({
  email,
  firstName,
  lastName,
  authMethod,
  callbackPort
}: SSOUserTokenFlowParams) => {
  let user = await User.findOne({
    email
  }).select("+publicKey");

  const serverCfg = getServerConfig();
  if (!user && !serverCfg.allowSignUp) throw new Error("User signup disabled");

  if (!user) {
    user = await new User({
      email,
      authMethods: [authMethod],
      firstName,
      lastName
    }).save();
  }

  let isLinkingRequired = false;
  if (!user.authMethods.includes(authMethod)) {
    isLinkingRequired = true;
  }

  const isUserCompleted = !!user.publicKey;
  const providerAuthToken = createToken({
    payload: {
      authTokenType: AuthTokenType.PROVIDER_TOKEN,
      userId: user._id.toString(),
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      authMethod,
      isUserCompleted,
      isLinkingRequired,
      ...(callbackPort
        ? {
            callbackPort
          }
        : {})
    },
    expiresIn: await getJwtProviderAuthLifetime(),
    secret: await getAuthSecret()
  });

  return { isUserCompleted, providerAuthToken };
};
