import { Tabs } from 'expo-router';
import {
  ClipboardList,
  House,
  Menu,
  Package,
  ScanLine,
  type LucideIcon,
} from 'lucide-react-native';
import { View, type ColorValue } from 'react-native';

import { MobileShell } from '../../src/components/app-shell';
import { font } from '../../src/lib/fonts';
import { makeStyles, useTheme } from '../../src/lib/theme';

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

/**
 * Scan does not read as a peer of the other four. It is a filled target in the
 * centre of the bar — the one control someone reaches for with a phone in one
 * hand and a case of stock in the other.
 */
function ScanTabIcon() {
  const { colors: c } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.scanTarget}>
      <ScanLine color={c.onAccent} size={24} strokeWidth={2.2} />
    </View>
  );
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
          // React Navigation paints its own scene background — a hardcoded
          // light grey — on top of the shell's `ground`. Unthemed, it stays
          // light while the text below it turns near-white in dark mode.
          sceneStyle: { backgroundColor: c.ground },
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
            // "Today" answers what the screen answers: what needs me now.
            title: 'Today',
            headerTitle: 'Anbaro',
            tabBarIcon: tabIcon(House),
          }}
        />
        <Tabs.Screen name="items" options={{ title: 'Items', tabBarIcon: tabIcon(Package) }} />
        <Tabs.Screen
          name="scan"
          options={{
            title: 'Scan',
            headerTitle: 'Scan',
            tabBarAccessibilityLabel: 'Scan a barcode',
            tabBarIcon: ScanTabIcon,
            // The filled target carries the meaning; a label under it would
            // only crowd the bar.
            tabBarLabel: () => null,
          }}
        />
        <Tabs.Screen
          name="counts"
          options={{ title: 'Counts', tabBarIcon: tabIcon(ClipboardList) }}
        />
        <Tabs.Screen
          name="more"
          options={{ title: 'Menu', headerShown: false, tabBarIcon: tabIcon(Menu) }}
        />
        {/* Alerts folds into Today, so it gives up its tab. The route stays
            registered and reachable — the Menu links to it — because losing a
            destination is not the same as demoting one. */}
        <Tabs.Screen name="alerts" options={{ href: null, title: 'Alerts' }} />
      </Tabs>
    </MobileShell>
  );
}

const useStyles = makeStyles((c) => ({
  scanTarget: {
    alignItems: 'center',
    backgroundColor: c.accent,
    borderRadius: 16,
    height: 46,
    justifyContent: 'center',
    // Lifts the target clear of its neighbours without changing the bar height.
    marginTop: -6,
    width: 52,
  },
}));
