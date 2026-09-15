import { DarkTheme, NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { colors } from "@/lib/theme";
import { HomeScreen } from "@/screens/HomeScreen";
import { SubscribeScreen } from "@/screens/SubscribeScreen";
import { TicketScreen } from "@/screens/TicketScreen";
import { TipScreen } from "@/screens/TipScreen";

import { RootStackParamList } from "./src/navigation";

const Stack = createNativeStackNavigator<RootStackParamList>();

const theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.bg,
    text: colors.text,
    border: colors.cardBorder,
    primary: colors.accent,
  },
};

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer theme={theme}>
        <StatusBar style="light" />
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: colors.bg },
            headerTintColor: colors.text,
            headerTitleStyle: { fontWeight: "600" },
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen
            name="Home"
            component={HomeScreen}
            options={{ title: "nodosol" }}
          />
          <Stack.Screen name="Tip" component={TipScreen} options={{ title: "Tip" }} />
          <Stack.Screen
            name="Subscribe"
            component={SubscribeScreen}
            options={{ title: "Subscribe" }}
          />
          <Stack.Screen
            name="Ticket"
            component={TicketScreen}
            options={{ title: "Ticket" }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
