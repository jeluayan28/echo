import { router } from 'expo-router';
import { useCallback } from 'react';

import { routes } from './routes';

/**
 * Back that always lands somewhere sensible: pops the stack when there is history,
 * otherwise (deep link / page reload on web) goes to the Memory Core instead of doing nothing.
 */
export function useSafeBack(fallback = routes.core) {
  return useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(fallback);
  }, [fallback]);
}
