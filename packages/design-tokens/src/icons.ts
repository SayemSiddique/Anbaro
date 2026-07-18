/**
 * Automatic category icons and item avatars.
 *
 * Every category gets a deterministic Lucide icon name + tint with zero setup:
 * keyword matching first, then a stable hash fallback so the same name always
 * renders the same tile on web and mobile. Users can still override the icon
 * by setting the category's stored icon to any known Lucide name.
 *
 * Icon names are Lucide PascalCase component keys; web resolves them through
 * `lucide-react` and mobile through `lucide-react-native`. No emoji anywhere.
 */
export type CategoryVisual = {
  /** Lucide icon component name, e.g. "Salad". */
  icon: string;
  /** Background tint for the avatar tile — derived from the brand palette. */
  background: string;
  /** Foreground tone paired with the tint; AA-contrast on the background. */
  accent: string;
};

/** Tints/shades of the five brand hues (lobster, tangerine, seashell, graphite, shadow). */
const palette: ReadonlyArray<{ background: string; accent: string }> = [
  { background: '#FBDEDE', accent: '#A33232' },
  { background: '#FFE4D6', accent: '#A64A26' },
  { background: '#F7EBE8', accent: '#6D6663' },
  { background: '#EDEAE9', accent: '#444140' },
  { background: '#EAE9EE', accent: '#1E1E24' },
  { background: '#FCEBE5', accent: '#B44040' },
  { background: '#FFEFE6', accent: '#8F4522' },
  { background: '#F2E6E1', accent: '#58514E' },
  { background: '#F5E1DC', accent: '#8F3B3B' },
  { background: '#EFE9E7', accent: '#33302F' },
];

const keywordIcons: ReadonlyArray<[RegExp, string]> = [
  [/\b(produce|vegetable|veg|fruit|salad|greens)\b/i, 'Salad'],
  [/\b(meat|beef|pork|poultry|chicken|butcher)\b/i, 'Beef'],
  [/\b(fish|seafood)\b/i, 'Fish'],
  [/\b(dairy|milk|cheese|yogurt)\b/i, 'Milk'],
  [/\b(bakery|bread|pastry|baked)\b/i, 'Croissant'],
  [/\b(beverage|drink|juice|soda|coffee|tea)\b/i, 'CupSoda'],
  [/\b(alcohol|beer|wine|spirits|liquor|bar)\b/i, 'Wine'],
  [/\b(frozen|freezer|ice)\b/i, 'Snowflake'],
  [/\b(dry|grain|rice|pasta|flour|pantry|staple)\b/i, 'Wheat'],
  [/\b(spice|seasoning\w*|sauce|condiment|oil)\b/i, 'Soup'],
  [/\b(snack|candy|sweet|chocolate)\b/i, 'Candy'],
  [/\b(clean\w*|sanit\w*|chemical|detergent|soap)\b/i, 'SprayCan'],
  [/\b(paper|napkin|tissue|towel)\b/i, 'Scroll'],
  [/\b(packag\w*|wrap|foil|container|to-?go|disposable)\b/i, 'Package'],
  [/\b(tool|hardware|screw|nail|fastener)\b/i, 'Wrench'],
  [/\b(equipment|machine|appliance)\b/i, 'Cog'],
  [/\b(electronic|electric|cable|battery|charger|tech)\b/i, 'Plug'],
  [/\b(computer|laptop|it|device)\b/i, 'Laptop'],
  [/\b(office|stationer\w*|pen|desk|supplies)\b/i, 'FolderOpen'],
  [/\b(furniture|chair|table|shelf)\b/i, 'Armchair'],
  [/\b(cloth\w*|apparel|garment|uniform|textile|fabric)\b/i, 'Shirt'],
  [/\b(shoe|footwear|boot)\b/i, 'Footprints'],
  [/\b(medical|medicine|pharma|first aid|health)\b/i, 'Pill'],
  [/\b(beauty|cosmetic|skincare|hair)\b/i, 'Sparkles'],
  [/\b(toy|game)\b/i, 'Gamepad2'],
  [/\b(book|print|media)\b/i, 'BookOpen'],
  [/\b(plant|garden|flower|seed)\b/i, 'Sprout'],
  [/\b(pet|animal|feed)\b/i, 'PawPrint'],
  [/\b(auto|car|vehicle|tire|part)\b/i, 'Car'],
  [/\b(paint|coating\w*)\b/i, 'Paintbrush'],
  [/\b(safety|ppe|glove|mask|helmet)\b/i, 'HardHat'],
  [/\b(light|lamp|bulb)\b/i, 'Lightbulb'],
  [/\b(plumb\w*|pipe|valve)\b/i, 'Droplet'],
  [/\b(jewel\w*|accessor\w*|watch)\b/i, 'Gem'],
  [/\b(sport|fitness|gym)\b/i, 'Dumbbell'],
  [/\b(baby|infant|kid)\b/i, 'Baby'],
];

const fallbackIcons = [
  'Package',
  'Tag',
  'Boxes',
  'Archive',
  'ShoppingBasket',
  'Container',
  'Layers',
  'Box',
] as const;

/** Every icon name this module can emit — used to validate stored overrides. */
export const categoryIconNames: readonly string[] = [
  ...new Set([...keywordIcons.map(([, icon]) => icon), ...fallbackIcons]),
];

function hashString(value: string): number {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return Math.abs(hash);
}

/** Normalizes stored overrides: accepts "cup-soda", "cupSoda", or "CupSoda". */
function normalizeIconName(value: string): string {
  return value
    .trim()
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

const knownIcons = new Set(categoryIconNames);

/**
 * Resolves the visual for a category. `storedIcon` (user override) wins when
 * it names a known icon; otherwise keyword match, then hash fallback. Colors
 * always come from the stable hash so overriding the icon keeps the tint.
 */
export function categoryVisual(name: string, storedIcon?: string | null): CategoryVisual {
  const normalized = name.trim();
  const colors = palette[hashString(normalized.toLowerCase()) % palette.length]!;
  const override = storedIcon ? normalizeIconName(storedIcon) : '';
  if (override && knownIcons.has(override)) return { icon: override, ...colors };
  for (const [pattern, icon] of keywordIcons) {
    if (pattern.test(normalized)) return { icon, ...colors };
  }
  const icon = fallbackIcons[hashString(normalized.toLowerCase()) % fallbackIcons.length]!;
  return { icon, ...colors };
}
