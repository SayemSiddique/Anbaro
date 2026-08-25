import { Tabs } from 'expo-router';
import { Bell, ClipboardList, House, Package, Menu, type LucideIcon } from 'lucide-react-native';
import type { ColorValue } from 'react-native';

import { MobileShell } from '../../src/components/app-shell';
import { font } from '../../src/lib/fonts';
import { useTheme } from '../../src/lib/theme';

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
  const { colors: c } = useTheme();
  return (
    <MobileShell>
      <Tabs
        screenOptions={{
          headerStyle: { backgroundColor: c.surface },
          headerTitleStyle: { color: c.ink, fontFamily: font.bold },
          headerShadowVisible: false,
          tabBarActiveTintColor: c.accent,
          tabBarInactiveTintColor: c.inkMuted,
          tabBarLabelStyle: { fontSize: 11, fontFamily: font.semibold },
          tabBarStyle: {
            backgroundColor: c.surface,
            borderTopColor: c.hairline,
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
        <Tabs.Screen name="items" options={{ title: 'Items', tabBarIcon: tabIcon(Package) }} />
        <Tabs.Screen
          name="counts"
          options={{ title: 'Counts', tabBarIcon: tabIcon(ClipboardList) }}
        />
        <Tabs.Screen name="alerts" options={{ title: 'Alerts', tabBarIcon: tabIcon(Bell) }} />
        <Tabs.Screen
          name="more"
          options={{ title: 'More', headerShown: false, tabBarIcon: tabIcon(Menu) }}
        />
      </Tabs>
    </MobileShell>
  );
}
