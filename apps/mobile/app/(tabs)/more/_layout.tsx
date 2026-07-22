import { Stack } from 'expo-router';

import { tokens } from '@anbaro/design-tokens';
import { font } from '../../../src/lib/fonts';

export default function MoreLayout() {
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: tokens.color.canvas },
        headerShadowVisible: false,
        headerStyle: { backgroundColor: tokens.color.surface },
        headerTintColor: tokens.color.primary,
        headerTitleStyle: { color: tokens.color.text, fontFamily: font.bold },
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
