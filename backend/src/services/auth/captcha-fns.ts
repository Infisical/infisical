import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";

const assertValidCaptchaToken = async (captchaToken: string) => {
  const appCfg = getConfig();
  const response = await request.postForm<{ success: boolean }>("https://api.hcaptcha.com/siteverify", {
    response: captchaToken,
    secret: appCfg.CAPTCHA_SECRET
  });

  if (!response.data.success) {
    throw new BadRequestError({
      name: "Invalid Captcha"
    });
  }
};

export const verifyCaptcha = async (consecutiveFailedPasswordAttempts?: number | null, captchaToken?: string) => {
  const appCfg = getConfig();
  if (consecutiveFailedPasswordAttempts && consecutiveFailedPasswordAttempts >= 10 && Boolean(appCfg.CAPTCHA_SECRET)) {
    if (!captchaToken) {
      throw new BadRequestError({
        name: "Captcha Required",
        message: "Accomplish the required captcha by logging in via Web"
      });
    }

    await assertValidCaptchaToken(captchaToken);
  }
};

export const verifyPublicEmailCaptcha = async (captchaToken?: string) => {
  const appCfg = getConfig();
  if (!appCfg.CAPTCHA_SECRET || !appCfg.CAPTCHA_SITE_KEY) return;

  if (!captchaToken) {
    throw new BadRequestError({
      name: "Captcha Required",
      message: "Complete the captcha to continue"
    });
  }

  await assertValidCaptchaToken(captchaToken);
};
