import { router } from 'expo-router';
import { TabList, TabSlot, TabTrigger, Tabs } from 'expo-router/ui';

import { CaptureTabButton, TabBarButton, useTabBarStyle } from '@/components/ui';
import { routes } from '@/navigation/routes';
import { colors } from '@/theme';

/**
 * Headless Expo Router tabs rendered with ECHO's own tab bar.
 * Order: Core · Map · [Capture] · Search · Vault. Capture is an action: it opens the
 * create-memory modal on top of the tabs and never becomes the active tab.
 */
export default function TabsLayout() {
  const barStyle = useTabBarStyle();

  return (
    <Tabs style={{ flex: 1, backgroundColor: colors.void }}>
      <TabSlot style={{ flex: 1 }} />
      <TabList style={barStyle}>
        <TabTrigger name="index" href="/" asChild>
          <TabBarButton label="Core" icon="core" />
        </TabTrigger>
        <TabTrigger name="map" href="/map" asChild>
          <TabBarButton label="Map" icon="map" />
        </TabTrigger>
        <TabTrigger name="capture" href="/capture" asChild>
          <CaptureTabButton onPress={() => router.push(routes.newMemory)} />
        </TabTrigger>
        <TabTrigger name="search" href="/search" asChild>
          <TabBarButton label="Search" icon="search" />
        </TabTrigger>
        <TabTrigger name="vault" href="/vault" asChild>
          <TabBarButton label="Vault" icon="folder" />
        </TabTrigger>
      </TabList>
    </Tabs>
  );
}
