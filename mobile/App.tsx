import { Archivo_400Regular, Archivo_500Medium, Archivo_600SemiBold } from "@expo-google-fonts/archivo";
import { GeistMono_400Regular, GeistMono_500Medium } from "@expo-google-fonts/geist-mono";
import { useFonts } from "expo-font";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AppShell } from "./src/AppShell";
import { StoreProvider } from "./src/data/store";

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
      <StoreProvider>
        <AppShell />
      </StoreProvider>
    </SafeAreaProvider>
  );
}
