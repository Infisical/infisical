import { Archivo_400Regular, Archivo_500Medium, Archivo_600SemiBold } from "@expo-google-fonts/archivo";
import { GeistMono_400Regular, GeistMono_500Medium } from "@expo-google-fonts/geist-mono";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { SessionProvider, useSession } from "./src/auth/session";
import { AppShell } from "./src/AppShell";
import { LiveStoreProvider } from "./src/data/live-store";
import { DemoStoreProvider } from "./src/data/store";
import { SignInScreen } from "./src/screens/SignInScreen";

const Root = () => {
  const { session } = useSession();
  if (session.mode === "loading") return null;
  if (session.mode === "signed-out")
    return (
      <>
        <StatusBar style="auto" />
        <SignInScreen notice={session.notice} lastInstance={session.lastInstance} />
      </>
    );
  if (session.mode === "demo")
    return (
      <DemoStoreProvider>
        <AppShell />
      </DemoStoreProvider>
    );
  return (
    <LiveStoreProvider key={session.instance} instance={session.instance}>
      <AppShell />
    </LiveStoreProvider>
  );
};

export default function App() {
  const [loaded] = useFonts({
    Archivo_400Regular,
    Archivo_500Medium,
    Archivo_600SemiBold,
    GeistMono_400Regular,
    GeistMono_500Medium
  });
  if (!loaded) return null;
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <Root />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
