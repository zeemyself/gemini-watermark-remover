export function shouldHideNativeImageActions({
  controlsInjected,
  controlsReady,
  showNativeButtons,
  hasRuntimeError
}) {
  if (showNativeButtons) return false;
  if (hasRuntimeError) return false;
  return controlsInjected === true && controlsReady === true;
}
