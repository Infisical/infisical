import * as Haptics from "expo-haptics";
import * as LocalAuthentication from "expo-local-authentication";

export const confirmWithDevice = async (promptMessage: string) => {
  const [hasHardware, isEnrolled] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync()
  ]);
  if (!hasHardware || !isEnrolled) return true;
  const result = await LocalAuthentication.authenticateAsync({ promptMessage });
  return result.success;
};

export const decisionHaptic = (action: "approve" | "deny") =>
  Haptics.notificationAsync(
    action === "approve" ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning
  ).catch(() => undefined);
