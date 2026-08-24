/**
 * Stands in for @ikas/component-utils.
 *
 * On ikas, `observer` re-renders a component when the observable props it read
 * change. Our props are plain values passed down from one mount, so there is
 * nothing to observe and the identity function is the whole implementation.
 */
export function observer<T>(component: T): T {
  return component;
}
