import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import React from 'react';
import { StyleSheet } from 'react-native';

import { useTheme, useTranslucentBars } from '@/ui/theme';

export default function TabsLayout() {
  const { colors, textScale, largeTargets, highContrast, isDark } = useTheme();
  const labelSize = 12 * Math.min(textScale, 1.3);
  const iconSize = largeTargets ? 30 : 26;
  // a translucent material that content scrolls under; solid with Reduce Transparency, high contrast, or on Android
  const material = useTranslucentBars();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.ink3,
        tabBarLabelStyle: { fontSize: labelSize, fontWeight: '500' },
        tabBarAllowFontScaling: true,
        tabBarItemStyle: { minHeight: largeTargets ? 60 : 48 },
        tabBarBackground: material
          ? () => <BlurView tint={isDark ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'} intensity={100} style={StyleSheet.absoluteFill} />
          : undefined,
        tabBarStyle: {
          position: material ? 'absolute' : 'relative',
          backgroundColor: material ? 'transparent' : colors.surface,
          borderTopColor: highContrast ? colors.ink : colors.hairline,
          borderTopWidth: highContrast ? 2 : StyleSheet.hairlineWidth,
        },
        sceneStyle: { backgroundColor: colors.bg },
        animation: 'none',
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Measure',
          tabBarAccessibilityLabel: 'Measure. Take a tremor reading',
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'hand-left' : 'hand-left-outline'} size={iconSize} color={typeof color === 'string' ? color : undefined} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarAccessibilityLabel: 'History. Past readings and trends',
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'stats-chart' : 'stats-chart-outline'} size={iconSize} color={typeof color === 'string' ? color : undefined} />,
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: 'Insights',
          tabBarAccessibilityLabel: 'Insights. Your patterns and tips',
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'bulb' : 'bulb-outline'} size={iconSize} color={typeof color === 'string' ? color : undefined} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarAccessibilityLabel: 'Settings. Accessibility, reminders and account',
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'settings' : 'settings-outline'} size={iconSize} color={typeof color === 'string' ? color : undefined} />,
        }}
      />
    </Tabs>
  );
}
