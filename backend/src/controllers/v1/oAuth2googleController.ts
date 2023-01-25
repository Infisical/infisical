import { google } from "googleapis";
import { createToken, issueTokens, clearTokens } from "../../helpers/auth";
import { User } from "../../models";
import {
  NODE_ENV,
  JWT_AUTH_LIFETIME,
  JWT_AUTH_SECRET,
  JWT_REFRESH_SECRET,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URL,
} from "../../config";

const oauth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URL
);
