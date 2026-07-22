import { tokens } from '@anbaro/design-tokens';

/**
 * SN Pro — the single brand typeface, loaded at runtime by app/_layout.tsx.
 *
 * React Native (Android especially) can't pick weights within one loaded
 * family, so each weight is its own family name. The names come from
 * design-tokens (`typography.nativeFontFamily`), the single source of truth;
 * only the static `require` paths live here because Metro needs them literal.
 *
 * Usage in styles:  { fontFamily: font.semibold }  — never `fontWeight`,
 * which would trigger faux-bolding on top of the real cut.
 */
export const font = tokens.typography.nativeFontFamily;

/** Asset map for expo-font's useFonts — keys must match the family names. */
export const fontAssets = {
  [font.regular]: require('../../assets/fonts/SNPro-Regular.ttf'),
  [font.medium]: require('../../assets/fonts/SNPro-Medium.ttf'),
  [font.semibold]: require('../../assets/fonts/SNPro-SemiBold.ttf'),
  [font.bold]: require('../../assets/fonts/SNPro-Bold.ttf'),
  [font.extrabold]: require('../../assets/fonts/SNPro-ExtraBold.ttf'),
};
