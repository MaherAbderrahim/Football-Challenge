import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { savePlayerImageFromUri } from './imageStorage';
import { addPlayersBatch } from '../database/database';
import { randomUUID } from 'expo-crypto';

export async function importLocalImages(
  uris: { uri: string; filename: string }[],
  categoryId: string,
  onProgress?: (current: number, total: number) => void
): Promise<number> {
  let imported = 0;
  const players: { id: string; categoryId: string; imageUri: string; odds: number }[] = [];

  for (let i = 0; i < uris.length; i++) {
    try {
      const savedUri = await savePlayerImageFromUri(categoryId, uris[i].uri, uris[i].filename);
      players.push({
        id: randomUUID(),
        categoryId,
        imageUri: savedUri,
        odds: 1,
      });
      imported++;
    } catch (e) {
      console.warn(`Failed to import ${uris[i].filename}:`, e);
    }
    onProgress?.(i + 1, uris.length);
  }

  if (players.length > 0) {
    await addPlayersBatch(players);
  }

  return imported;
}

export async function pickAndImportImages(
  categoryId: string,
  onProgress?: (current: number, total: number) => void
): Promise<number> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.8,
    allowsMultipleSelection: true,
  });

  if (result.canceled || !result.assets?.length) return 0;

  const uris = result.assets.map(asset => ({
    uri: asset.uri,
    filename: asset.fileName || `image_${Date.now()}.jpg`,
  }));

  return importLocalImages(uris, categoryId, onProgress);
}
