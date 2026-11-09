import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * Keeps one function identity for the component's lifetime and forwards each call to the latest render's
 * `callback`, so memoized children skip re-renders. Unlike `useEffectEvent`, the result may be passed as a prop.
 */
export function useStableCallback<Args extends unknown[], Result>(
  callback: (...args: Args) => Result,
): (...args: Args) => Result {
  const latestCallbackRef = useRef(callback);

  useLayoutEffect(() => {
    latestCallbackRef.current = callback;
  });

  return useCallback((...args: Args) => latestCallbackRef.current(...args), []);
}
