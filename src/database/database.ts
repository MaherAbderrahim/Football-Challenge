import * as SQLite from 'expo-sqlite';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Player, MultiplierModel, ChallengeConfig, Category } from '../types';
import { PLAYER_ASSETS } from '../data/playerAssets';
import {
  TM_CATEGORY_ID, TM_CATEGORY_NAME,
  TM_MODEL_ID, TM_MODEL_NAME, TM_MODEL_DISTRIBUTION,
  TM_CONFIG_ID, TM_CONFIG_NAME, TM_CONFIG_LAYOUT, TM_CONFIG_FRAME_STYLE,
  TM_IMAGES,
} from '../data/transfertMarketFilter';

let db: SQLite.SQLiteDatabase | null = null;

// v2: the Transfert Market filter added 193 bundled photos that must be copied
// over on installs already seeded with v1.
const SEED_FLAG_KEY = 'bundled_seed_done_v2';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const BUNDLED_DB_ASSET = require('../../assets/db/defifoot.db');

/**
 * First-launch seeding: copies the bundled database (category "Joueur Arabe",
 * 124 players, multiplier model + challenge config "Hot_hetha") into the app's
 * SQLite folder, and copies the 124 player photos to player_images/<category>.
 * The image_uri values stored in the DB point to
 * file:///data/user/0/<package>/files/player_images/... which is valid on any
 * device because the applicationId is identical.
 */
async function ensureBundledDb() {
  try {
    const dir = `${FileSystem.documentDirectory}SQLite/`;
    const target = `${dir}defifoot.db`;
    const info = await FileSystem.getInfoAsync(target);
    if (info.exists) return;
    const asset = Asset.fromModule(BUNDLED_DB_ASSET);
    await asset.downloadAsync();
    if (!asset.localUri) return;
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    await FileSystem.copyAsync({ from: asset.localUri, to: target });
  } catch (e) {
    console.warn('bundled db copy failed', e);
  }
}

async function ensurePlayerImages(database: SQLite.SQLiteDatabase) {
  try {
    const flag = await AsyncStorage.getItem(SEED_FLAG_KEY);
    if (flag) return;
    const rows = await database.getAllAsync<{ category_id: string; image_uri: string }>(
      'SELECT category_id, image_uri FROM players WHERE image_uri LIKE ?',
      ['%player_images/%']
    );
    for (const row of rows) {
      const filename = row.image_uri.split('/').pop();
      if (!filename) continue;
      const moduleId = PLAYER_ASSETS[filename];
      if (!moduleId) continue;
      const asset = Asset.fromModule(moduleId);
      await asset.downloadAsync();
      if (!asset.localUri) continue;
      const dir = `${FileSystem.documentDirectory}player_images/${row.category_id}/`;
      const dest = `${dir}${filename}`;
      const fileInfo = await FileSystem.getInfoAsync(dest);
      if (fileInfo.exists) continue;
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      await FileSystem.copyAsync({ from: asset.localUri, to: dest });
    }
    await AsyncStorage.setItem(SEED_FLAG_KEY, '1');
  } catch (e) {
    console.warn('player image seed failed', e);
  }
}

/**
 * Second filter ("Transfert Market"): inserted directly into the live database
 * rather than into assets/db/defifoot.db, because ensureBundledDb() keeps the
 * device's existing database and re-copying it would wipe the user's configs.
 * Idempotent: skipped once the category row exists.
 */
async function ensureTransfertMarketFilter(database: SQLite.SQLiteDatabase) {
  try {
    const existing = await database.getFirstAsync<{ id: string }>(
      'SELECT id FROM categories WHERE id = ?',
      [TM_CATEGORY_ID]
    );
    if (existing) return;

    await database.runAsync(
      'INSERT OR IGNORE INTO categories (id, name) VALUES (?, ?)',
      TM_CATEGORY_ID, TM_CATEGORY_NAME
    );
    await database.runAsync(
      'INSERT OR IGNORE INTO multiplier_models (id, name, distribution) VALUES (?, ?, ?)',
      TM_MODEL_ID, TM_MODEL_NAME, JSON.stringify(TM_MODEL_DISTRIBUTION)
    );

    const dir = `${FileSystem.documentDirectory}player_images/${TM_CATEGORY_ID}/`;
    const args: (string | number)[] = [];
    const tuples = TM_IMAGES.map(file => {
      args.push(file, TM_CATEGORY_ID, `${dir}${file}`, 1);
      return '(?, ?, ?, ?)';
    });
    await database.runAsync(
      `INSERT OR IGNORE INTO players (id, category_id, image_uri, odds) VALUES ${tuples.join(', ')}`,
      ...args
    );

    await database.runAsync(
      'INSERT OR IGNORE INTO challenge_configs (id, name, category_id, multiplier_model_id, layout, text_blocks, frame_style) VALUES (?, ?, ?, ?, ?, ?, ?)',
      TM_CONFIG_ID, TM_CONFIG_NAME, TM_CATEGORY_ID, TM_MODEL_ID,
      JSON.stringify(TM_CONFIG_LAYOUT), '[]', TM_CONFIG_FRAME_STYLE
    );
  } catch (e) {
    console.warn('transfert market filter seed failed', e);
  }
}

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  await ensureBundledDb();
  db = await SQLite.openDatabaseAsync('defifoot.db');
  await initDatabase(db);
  await ensureTransfertMarketFilter(db);
  await ensurePlayerImages(db).catch(e => console.warn(e));
  return db;
}

async function initDatabase(database: SQLite.SQLiteDatabase) {
  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      category_id TEXT NOT NULL,
      image_uri TEXT NOT NULL,
      odds REAL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS multiplier_models (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      distribution TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS challenge_configs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category_id TEXT NOT NULL,
      multiplier_model_id TEXT NOT NULL,
      layout TEXT NOT NULL DEFAULT '{}',
      text_blocks TEXT NOT NULL DEFAULT '[]',
      frame_style TEXT NOT NULL DEFAULT 'rounded',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
      FOREIGN KEY (multiplier_model_id) REFERENCES multiplier_models(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS session_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id TEXT NOT NULL,
      image_uri TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      session_date TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS session_videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id TEXT,
      video_uri TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      session_date TEXT DEFAULT (datetime('now'))
    );
  `);

  await migrateLegacySchema(database);
  await ensureChallengeConfigSchema(database);
}

// Les anciennes bases n'avaient pas la colonne `frame_style` : on l'ajoute si
// elle manque, pour que le cadre choisi soit conservé avec la configuration.
async function ensureChallengeConfigSchema(database: SQLite.SQLiteDatabase) {
  try {
    const tables = await database.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'challenge_configs'"
    );
    if (tables.length === 0) return;

    const columns = await database.getAllAsync<{ name: string }>(
      'PRAGMA table_info(challenge_configs)'
    );
    if (columns.some(col => col.name === 'frame_style')) return;

    await database.execAsync(
      "ALTER TABLE challenge_configs ADD COLUMN frame_style TEXT NOT NULL DEFAULT 'rounded'"
    );
  } catch {}
}

// Les anciennes bases contenaient une colonne `values` ou `value` au lieu de
// `distribution` : on la renomme. Si elle manque totalement, on l'ajoute.
async function migrateLegacySchema(database: SQLite.SQLiteDatabase) {
  try {
    const tables = await database.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'multiplier_models'"
    );
    if (tables.length === 0) return;

    const columns = await database.getAllAsync<{ name: string }>(
      'PRAGMA table_info(multiplier_models)'
    );
    const names = columns.map(col => col.name);

    if (names.includes('distribution')) return;

    if (names.includes('values')) {
      // "values" est un mot-clé SQL réservé : il faut le mettre entre guillemets
      // dans le DDL, sinon l'ALTER échoue avec une erreur de syntaxe.
      await database.execAsync('ALTER TABLE multiplier_models RENAME COLUMN "values" TO distribution');
    } else if (names.includes('value')) {
      await database.execAsync('ALTER TABLE multiplier_models RENAME COLUMN "value" TO distribution');
    } else {
      await database.execAsync(
        "ALTER TABLE multiplier_models ADD COLUMN distribution TEXT NOT NULL DEFAULT '[]'"
      );
    }
  } catch {
    // Aucune table existante ou autre version : rien à migrer.
  }
}

// Categories
export async function getCategories(): Promise<Category[]> {
  const db = await getDatabase();
  return db.getAllAsync<Category>('SELECT * FROM categories ORDER BY name');
}

export async function addCategory(id: string, name: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('INSERT INTO categories (id, name) VALUES (?, ?)', id, name);
}

export async function deleteCategory(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM categories WHERE id = ?', id);
}

// Players
export async function getPlayers(categoryId: string): Promise<Player[]> {
  const db = await getDatabase();
  return db.getAllAsync<Player>(
    'SELECT * FROM players WHERE category_id = ? ORDER BY created_at',
    categoryId
  );
}

export async function getAllPlayers(): Promise<Player[]> {
  const db = await getDatabase();
  return db.getAllAsync<Player>('SELECT * FROM players ORDER BY category_id, created_at');
}

export async function addPlayer(id: string, categoryId: string, imageUri: string, odds: number = 1): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'INSERT INTO players (id, category_id, image_uri, odds) VALUES (?, ?, ?, ?)',
    id, categoryId, imageUri, odds
  );
}

export async function addPlayersBatch(players: { id: string; categoryId: string; imageUri: string; odds: number }[]): Promise<void> {
  const db = await getDatabase();
  for (const player of players) {
    await db.runAsync(
      'INSERT INTO players (id, category_id, image_uri, odds) VALUES (?, ?, ?, ?)',
      player.id, player.categoryId, player.imageUri, player.odds
    );
  }
}

export async function updatePlayerOdds(id: string, odds: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE players SET odds = ? WHERE id = ?', odds, id);
}

export async function deletePlayer(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM players WHERE id = ?', id);
}

export async function getPlayerCount(categoryId: string): Promise<number> {
  const db = await getDatabase();
  const result = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM players WHERE category_id = ?',
    categoryId
  );
  return result?.count ?? 0;
}

// Multiplier Models
// Le fichier de base peut être remplacé par un mécanisme de restauration Android
// (backup/restore) alors que l'application tourne déjà. On re-vérifie le schéma
// avant chaque ordre qui touche multiplier_models.
async function ensureMultiplierSchema(db: SQLite.SQLiteDatabase) {
  try {
    const tables = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'multiplier_models'"
    );
    if (tables.length === 0) return;

    const columns = await db.getAllAsync<{ name: string }>(
      'PRAGMA table_info(multiplier_models)'
    );
    const names = columns.map(col => col.name);
    if (names.includes('distribution')) return;

    if (names.includes('values')) {
      await db.execAsync('ALTER TABLE multiplier_models RENAME COLUMN "values" TO distribution');
    } else if (names.includes('value')) {
      await db.execAsync('ALTER TABLE multiplier_models RENAME COLUMN "value" TO distribution');
    } else {
      await db.execAsync("ALTER TABLE multiplier_models ADD COLUMN distribution TEXT NOT NULL DEFAULT '[]'");
    }
  } catch {}
}

export async function getMultiplierModels(): Promise<MultiplierModel[]> {
  const db = await getDatabase();
  await ensureMultiplierSchema(db);
  const rows = await db.getAllAsync<{ id: string; name: string; distribution: string; created_at: string }>(
    'SELECT id, name, distribution, created_at FROM multiplier_models ORDER BY name'
  );
  return rows.map(row => ({
    id: row.id,
    name: row.name,
    values: JSON.parse(row.distribution),
    created_at: row.created_at,
  }));
}

export async function addMultiplierModel(id: string, name: string, values: number[]): Promise<void> {
  const db = await getDatabase();
  await ensureMultiplierSchema(db);
  await db.runAsync(
    'INSERT INTO multiplier_models (id, name, distribution) VALUES (?, ?, ?)',
    id, name, JSON.stringify(values)
  );
}

export async function deleteMultiplierModel(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM multiplier_models WHERE id = ?', id);
}

// Challenge Configs
export async function getChallengeConfigs(): Promise<ChallengeConfig[]> {
  const db = await getDatabase();
  await ensureChallengeConfigSchema(db);
  const rows = await db.getAllAsync<{
    id: string; name: string; category_id: string;
    multiplier_model_id: string; layout: string;
    text_blocks: string; frame_style: string; created_at: string;
  }>('SELECT * FROM challenge_configs ORDER BY name');
  return rows.map(row => ({
    ...row,
    layout: JSON.parse(row.layout),
    text_blocks: JSON.parse(row.text_blocks),
    frame_style: row.frame_style || 'rounded',
  }));
}

export async function addChallengeConfig(config: ChallengeConfig): Promise<void> {
  const db = await getDatabase();
  await ensureChallengeConfigSchema(db);
  await db.runAsync(
    'INSERT INTO challenge_configs (id, name, category_id, multiplier_model_id, layout, text_blocks, frame_style) VALUES (?, ?, ?, ?, ?, ?, ?)',
    config.id, config.name, config.category_id, config.multiplier_model_id,
    JSON.stringify(config.layout), JSON.stringify(config.text_blocks), config.frame_style ?? 'rounded'
  );
}

export async function updateChallengeConfig(config: ChallengeConfig): Promise<void> {
  const db = await getDatabase();
  await ensureChallengeConfigSchema(db);
  await db.runAsync(
    'UPDATE challenge_configs SET name = ?, category_id = ?, multiplier_model_id = ?, layout = ?, text_blocks = ?, frame_style = ? WHERE id = ?',
    config.name, config.category_id, config.multiplier_model_id,
    JSON.stringify(config.layout), JSON.stringify(config.text_blocks),
    config.frame_style ?? 'rounded', config.id
  );
}

export async function deleteChallengeConfig(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM challenge_configs WHERE id = ?', id);
}

// Session Photos
export async function addSessionPhoto(playerId: string, imageUri: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'INSERT INTO session_photos (player_id, image_uri, timestamp) VALUES (?, ?, ?)',
    playerId, imageUri, Date.now()
  );
}

export async function getSessionPhotos(): Promise<{ player_id: string; image_uri: string; timestamp: number; session_date: string }[]> {
  const db = await getDatabase();
  return db.getAllAsync(
    'SELECT * FROM session_photos ORDER BY timestamp DESC LIMIT 100'
  );
}

export async function clearSessionPhotos(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM session_photos');
}

// Session Videos
export async function addSessionVideo(playerId: string, videoUri: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'INSERT INTO session_videos (player_id, video_uri, timestamp) VALUES (?, ?, ?)',
    playerId, videoUri, Date.now()
  );
}

export async function getSessionVideos(): Promise<{ player_id: string; video_uri: string; timestamp: number; session_date: string }[]> {
  const db = await getDatabase();
  return db.getAllAsync(
    'SELECT * FROM session_videos ORDER BY timestamp DESC LIMIT 100'
  );
}
