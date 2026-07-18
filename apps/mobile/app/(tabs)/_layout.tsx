import { Tabs } from 'expo-router';
import { Bell, ClipboardList, House, Package, Menu, type LucideIcon } from 'lucide-react-native';
import type { ColorValue } from 'react-native';

import { tokens } from '@anbaro/design-tokens';
import { MobileShell } from '../../src/components/app-shell';

function tabIcon(Icon: LucideIcon) {
  function TabIcon({
    color,
    focused,
    size,
  }: {
    color: ColorValue;
    focused: boolean;
    size: number;
  }) {
    return <Icon color={color as string} size={size} strokeWidth={focused ? 2.4 : 1.8} />;
  }
  return TabIcon;
}

export default function TabLayout() {
  return (
    <MobileShell>
      <Tabs
        screenOptions={{
          headerStyle: { backgroundColor: tokens.color.surface },
          headerTitleStyle: { color: tokens.color.text, fontWeight: '700' },
          headerShadowVisible: false,
          tabBarActiveTintColor: tokens.color.primary,
          tabBarInactiveTintColor: tokens.color.textMuted,
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
          tabBarStyle: {
            backgroundColor: tokens.color.surface,
            borderTopColor: tokens.color.border,
            minHeight: 58,
          },
        }}
      >
        <Tabs.Screen
          name="home"
          options={{
            title: 'Home',
            headerTitle: 'Anbaro',
            tabBarIcon: tabIcon(House),
          }}
        />
        <Tabs.Screen
          name="items"
          options={{ title: 'Items', tabBarIcon: tabIcon(Package) }}
        />
        <Tabs.Screen
          name="counts"
          options={{ title: 'Counts', tabBarIcon: tabIcon(ClipboardList) }}
        />
        <Tabs.Screen
          name="alerts"
          options={{ title: 'Alerts', tabBarIcon: tabIcon(Bell) }}
        />
        <Tabs.Screen
          name="more"
          options={{ title: 'More', headerShown: false, tabBarIcon: tabIcon(Menu) }}
        />
      </Tabs>
    </MobileShell>
  );
}
