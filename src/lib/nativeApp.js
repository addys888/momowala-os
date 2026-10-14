// Narrow native commands. No account passwords or arbitrary executable code cross this boundary.
export function nativeCommand(command, data = {}) {
  if (!__ANDROID_APP__) return null;
  try { return JSON.parse(window.prompt('cartlyft-native-v1', JSON.stringify({ command, ...data })) || 'null'); }
  catch { return null; }
}
