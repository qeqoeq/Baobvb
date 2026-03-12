import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@baobab/store';

export async function loadPersistedState<T>(): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function persistState<T>(data: T): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // best-effort — silent fail
  }
}
