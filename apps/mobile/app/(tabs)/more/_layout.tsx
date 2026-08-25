import { Stack } from 'expo-router';

import { font } from '../../../src/lib/fonts';
import { useTheme } from '../../../src/lib/theme';

export default function MoreLayout() {
  const { colors: c } = useTheme();
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: c.ground },
        headerShadowVisible: false,
        headerStyle: { backgroundColor: c.surface },
        headerTintColor: c.accent,
        headerTitleStyle: { color: c.ink, fontFamily: font.bold },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'More' }} />
      <Stack.Screen name="assistant" options={{ title: 'Assistant' }} />
      <Stack.Screen name="suppliers" options={{ title: 'Suppliers' }} />
      <Stack.Screen name="reorder" options={{ title: 'Reorder review' }} />
      <Stack.Screen name="reports" options={{ title: 'Loss reports' }} />
      <Stack.Screen name="team" options={{ title: 'Team' }} />
      <Stack.Screen name="delete-account" options={{ title: 'Delete account' }} />
    </Stack>
  );
}
