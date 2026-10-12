import { Redirect } from 'expo-router';

import { routes } from '@/navigation/routes';

/**
 * Capture is an action, not a destination: the tab bar button opens the modal directly.
 * This route only exists so the tab has a target; if it is ever reached (deep link /capture)
 * it forwards to the create-memory screen.
 */
export default function CaptureRedirect() {
  return <Redirect href={routes.newMemory} />;
}
