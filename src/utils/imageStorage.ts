import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

const IMAGES_DIR = `${FileSystem.documentDirectory}player_images/`;

async function ensureDirExists(dir: string) {
  const dirInfo = await FileSystem.getInfoAsync(dir);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

export async function savePlayerImage(categoryId: string, filename: string, uri: string): Promise<string> {
  const categoryDir = `${IMAGES_DIR}${categoryId}/`;
  await ensureDirExists(categoryDir);

  const ext = filename.split('.').pop() || 'jpg';
  const safeName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${ext}`;
  const destUri = `${categoryDir}${safeName}`;

  await FileSystem.copyAsync({ from: uri, to: destUri });
  return destUri;
}

export async function savePlayerImageFromUri(categoryId: string, sourceUri: string, filename?: string): Promise<string> {
  const categoryDir = `${IMAGES_DIR}${categoryId}/`;
  await ensureDirExists(categoryDir);

  const ext = filename?.split('.').pop() || sourceUri.split('.').pop()?.split('?')[0] || 'jpg';
  const safeName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${ext}`;
  const destUri = `${categoryDir}${safeName}`;

  await FileSystem.copyAsync({ from: sourceUri, to: destUri });
  return destUri;
}

export async function deletePlayerImage(uri: string): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists) {
      await FileSystem.deleteAsync(uri);
    }
  } catch {}
}

export async function deleteCategoryImages(categoryId: string): Promise<void> {
  const categoryDir = `${IMAGES_DIR}${categoryId}/`;
  try {
    const info = await FileSystem.getInfoAsync(categoryDir);
    if (info.exists) {
      await FileSystem.deleteAsync(categoryDir);
    }
  } catch {}
}

export async function pickImage(): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.8,
    allowsMultipleSelection: false,
  });

  if (result.canceled || !result.assets?.length) return null;
  return result.assets[0].uri;
}

export async function pickMultipleImages(): Promise<{ uri: string; filename: string }[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.8,
    allowsMultipleSelection: true,
  });

  if (result.canceled || !result.assets?.length) return [];

  return result.assets.map(asset => ({
    uri: asset.uri,
    filename: asset.fileName || `image_${Date.now()}.jpg`,
  }));
}

export async function getLocalCategories(): Promise<string[]> {
  try {
    const info = await FileSystem.getInfoAsync(IMAGES_DIR);
    if (!info.exists) {
      return [];
    }
    const items = await FileSystem.readDirectoryAsync(IMAGES_DIR);
    return items;
  } catch {
    return [];
  }
}
