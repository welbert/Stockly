import { createContext, useContext, useEffect } from "react";

/** Lets the sidebar know the current page has unsaved/in-progress state
 * before navigating away — set by `AppShell`, read by the page via
 * `useNavigationGuard`. `null` outside `AppShell` (nothing to warn about). */
export const NavigationGuardContext = createContext<((dirty: boolean) => void) | null>(null);

/** Registers whether the current page should warn before the user navigates
 * away from it (e.g. Venda with items already in the cart). Automatically
 * clears the flag on unmount, so leaving the route never leaves a stale
 * warning behind for whichever page loads next. */
export function useNavigationGuard(dirty: boolean) {
  const setDirty = useContext(NavigationGuardContext);
  useEffect(() => {
    setDirty?.(dirty);
    return () => setDirty?.(false);
  }, [setDirty, dirty]);
}
