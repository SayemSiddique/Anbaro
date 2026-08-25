import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Fire-and-forget haptics for the count loop.
 *
 * A count is done by feel: the phone is at arm's length on a shelf, often held
 * one-handed, and the counter is looking at the stock rather than the screen.
 * The tap is what confirms the press landed.
 *
 * Every call is deliberately swallowed. `expo-haptics` resolves its native
 * module optionally, so importing it is safe in a binary built before the
 * dependency existed — the call just rejects, and a missing taptic engine must
 * never interrupt a count. Rebuild the native app to feel any of this.
 */
function fire(run: () => Promise<void>) {
  if (Platform.OS === 'web') return;
  void run().catch(() => {
    // No taptic engine, no native module, or the OS declined. Not worth a word.
  });
}

/** A key landed. The quietest tick the OS has — this fires sixty times a count. */
export function tapKey() {
  fire(() => Haptics.selectionAsync());
}

/** The count was committed to the queue. The one "something happened" tap. */
export function tapSaved() {
  fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

/** A scan resolved and the loop jumped to another item. */
export function tapJumped() {
  fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}

/** A scan matched nothing that can be counted here. */
export function tapRejected() {
  fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
}
