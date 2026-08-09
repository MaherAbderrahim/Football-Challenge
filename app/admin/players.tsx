import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getPlayers, deletePlayer, updatePlayerOdds } from '../../src/database/database';
import { deletePlayerImage, pickImage, savePlayerImage } from '../../src/utils/imageStorage';
import { Player } from '../../src/types';
import { COLORS, SPACING, FONTS, BORDER_RADIUS } from '../../src/constants/theme';
import { randomUUID } from 'expo-crypto';
import { addPlayer } from '../../src/database/database';

export default function PlayersScreen() {
  const { categoryId, categoryName } = useLocalSearchParams<{
    categoryId: string;
    categoryName: string;
  }>();

  const [players, setPlayers] = useState<Player[]>([]);

  useFocusEffect(
    useCallback(() => {
      loadPlayers();
    }, [categoryId])
  );

  async function loadPlayers() {
    const p = await getPlayers(categoryId!);
    setPlayers(p);
  }

  async function handleAddPlayer() {
    const uri = await pickImage();
    if (!uri) return;

    const ext = uri.split('.').pop()?.split('?')[0] || 'jpg';
    const savedUri = await savePlayerImage(categoryId!, `player.${ext}`, uri);
    const id = randomUUID();
    await addPlayer(id, categoryId!, savedUri, 1);
    loadPlayers();
  }

  function handleDeletePlayer(player: Player) {
    Alert.alert('Supprimer', 'Supprimer ce joueur ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          await deletePlayer(player.id);
          await deletePlayerImage(player.image_uri);
          loadPlayers();
        },
      },
    ]);
  }

  async function handleOddsChange(player: Player, delta: number) {
    const newOdds = Math.max(0.1, Math.min(100, player.odds + delta));
    await updatePlayerOdds(player.id, newOdds);
    loadPlayers();
  }

  return (
    <View style={styles.container}>
      <Text style={styles.categoryName}>{categoryName}</Text>
      <Text style={styles.count}>{players.length} joueur(s)</Text>

      <FlatList
        data={players}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.playerCard}>
            <Image source={{ uri: item.image_uri }} style={styles.thumbnail} />
            <View style={styles.playerInfo}>
              <Text style={styles.oddsText}>×{item.odds.toFixed(1)}</Text>
              <View style={styles.oddsControls}>
                <TouchableOpacity
                  style={styles.oddsButton}
                  onPress={() => handleOddsChange(item, -0.5)}
                >
                  <Ionicons name="remove" size={16} color={COLORS.text} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.oddsButton}
                  onPress={() => handleOddsChange(item, 0.5)}
                >
                  <Ionicons name="add" size={16} color={COLORS.text} />
                </TouchableOpacity>
              </View>
            </View>
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => handleDeletePlayer(item)}
            >
              <Ionicons name="trash-outline" size={18} color={COLORS.error} />
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="person-add-outline" size={48} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>
              Aucun joueur. Ajoutez-en un depuis le bouton ci-dessous.
            </Text>
          </View>
        }
      />

      <TouchableOpacity style={styles.addButton} onPress={handleAddPlayer}>
        <Ionicons name="add" size={24} color={COLORS.black} />
        <Text style={styles.addButtonText}>Ajouter un joueur</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: SPACING.lg,
  },
  categoryName: {
    fontSize: FONTS.xlarge,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  count: {
    fontSize: FONTS.small,
    color: COLORS.textSecondary,
    marginBottom: SPACING.lg,
  },
  list: {
    paddingBottom: 100,
  },
  playerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.sm,
  },
  thumbnail: {
    width: 50,
    height: 50,
    borderRadius: BORDER_RADIUS.md,
  },
  playerInfo: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  oddsText: {
    fontSize: FONTS.large,
    fontWeight: 'bold',
    color: COLORS.accent,
  },
  oddsControls: {
    flexDirection: 'row',
    gap: SPACING.xs,
    marginTop: SPACING.xs,
  },
  oddsButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButton: {
    padding: SPACING.sm,
  },
  empty: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyText: {
    fontSize: FONTS.regular,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: SPACING.md,
  },
  addButton: {
    position: 'absolute',
    bottom: 40,
    left: SPACING.lg,
    right: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    gap: SPACING.sm,
  },
  addButtonText: {
    fontSize: FONTS.medium,
    fontWeight: '600',
    color: COLORS.black,
  },
});
