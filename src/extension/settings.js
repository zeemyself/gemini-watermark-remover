export const DEFAULT_EXTENSION_SETTINGS = {
  showNativeButtons: false
};

export function normalizeExtensionSettings(value = {}) {
  return {
    showNativeButtons: value?.showNativeButtons === true
  };
}

export async function loadExtensionSettings(storageArea = globalThis.chrome?.storage?.local) {
  if (!storageArea?.get) {
    return DEFAULT_EXTENSION_SETTINGS;
  }

  const raw = await storageArea.get(Object.keys(DEFAULT_EXTENSION_SETTINGS));
  return normalizeExtensionSettings(raw);
}

export async function saveExtensionSettings(nextSettings, storageArea = globalThis.chrome?.storage?.local) {
  const normalized = normalizeExtensionSettings(nextSettings);
  if (!storageArea?.set) return normalized;
  await storageArea.set(normalized);
  return normalized;
}
