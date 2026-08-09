import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { getDatabase } from '../src/database/database';
import { COLORS } from '../src/constants/theme';

export default function RootLayout() {
  useEffect(() => {
    getDatabase();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: COLORS.background },
          headerTintColor: COLORS.text,
          contentStyle: { backgroundColor: COLORS.background },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="challenge-setup" options={{ title: 'Configurer le défi', presentation: 'card' }} />
        <Stack.Screen name="camera" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
        <Stack.Screen name="admin" options={{ title: 'Administration', presentation: 'card' }} />
        <Stack.Screen name="admin/players" options={{ title: 'Joueurs', presentation: 'card' }} />
        <Stack.Screen name="admin/multipliers" options={{ title: 'Modèles de multiplicateurs', presentation: 'card' }} />
        <Stack.Screen name="admin/import" options={{ title: 'Importer des joueurs', presentation: 'card' }} />
      </Stack>
    </GestureHandlerRootView>
  );
}
