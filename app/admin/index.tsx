import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  TextInput,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  getCategories,
  addCategory,
  deleteCategory,
  getPlayerCount,
} from '../../src/database/database';
import { COLORS, SPACING, FONTS, BORDER_RADIUS } from '../../src/constants/theme';
import { randomUUID } from 'expo-crypto';

interface CategoryWithCount {
  id: string;
  name: string;
  created_at: string;
  playerCount: number;
}

export default function AdminScreen() {
  const router = useRouter();
  const [categories, setCategories] = useState<CategoryWithCount[]>([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [showAddCategory, setShowAddCategory] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadCategories();
    }, [])
  );

  async function loadCategories() {
    const cats = await getCategories();
    const catsWithCount = await Promise.all(
      cats.map(async (cat: { id: string; name: string; created_at: string }) => ({
        ...cat,
        playerCount: await getPlayerCount(cat.id),
      }))
    );
    setCategories(catsWithCount);
  }

  async function handleAddCategory() {
    if (!newCategoryName.trim()) return;
    const id = randomUUID();
    await addCategory(id, newCategoryName.trim());
    setNewCategoryName('');
    setShowAddCategory(false);
    loadCategories();
  }

  function handleDeleteCategory(cat: CategoryWithCount) {
    Alert.alert(
      'Supprimer la catégorie',
      `Supprimer "${cat.name}" et toutes ses photos ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            await deleteCategory(cat.id);
            loadCategories();
          },
        },
      ]
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={categories}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.headerSection}>
            <Text style={styles.sectionTitle}>Catégories</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <TouchableOpacity
              style={styles.cardContent}
              onPress={() =>
                router.push({
                  pathname: '/admin/players',
                  params: { categoryId: item.id, categoryName: item.name },
                })
              }
            >
              <View style={styles.cardInfo}>
                <Text style={styles.cardName}>{item.name}</Text>
                <Text style={styles.cardCount}>
                  {item.playerCount} joueur{item.playerCount > 1 ? 's' : ''}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => handleDeleteCategory(item)}
            >
              <Ionicons name="trash-outline" size={18} color={COLORS.error} />
            </TouchableOpacity>
          </View>
        )}
        ListFooterComponent={
          <View style={styles.footer}>
            {showAddCategory ? (
              <View style={styles.addCategoryForm}>
                <TextInput
                  style={styles.input}
                  placeholder="Nom de la catégorie"
                  placeholderTextColor={COLORS.textMuted}
                  value={newCategoryName}
                  onChangeText={setNewCategoryName}
                  autoFocus
                />
                <View style={styles.formActions}>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => {
                      setShowAddCategory(false);
                      setNewCategoryName('');
                    }}
                  >
                    <Text style={styles.cancelButtonText}>Annuler</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.confirmButton}
                    onPress={handleAddCategory}
                  >
                    <Text style={styles.confirmButtonText}>Ajouter</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.addButton}
                onPress={() => setShowAddCategory(true)}
              >
                <Ionicons name="add-circle" size={22} color={COLORS.primary} />
                <Text style={styles.addButtonText}>Ajouter une catégorie</Text>
              </TouchableOpacity>
            )}
          </View>
        }
      />

      {/* Navigation buttons */}
      <View style={styles.navSection}>
        <TouchableOpacity
          style={styles.navButton}
          onPress={() => router.push('/admin/multipliers')}
        >
          <Ionicons name="calculator-outline" size={22} color={COLORS.primary} />
          <Text style={styles.navButtonText}>Modèles de multiplicateurs</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navButton}
          onPress={() => router.push('/admin/import')}
        >
          <Ionicons name="cloud-download-outline" size={22} color={COLORS.accent} />
          <Text style={styles.navButtonText}>Importer des joueurs</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  list: {
    padding: SPACING.lg,
    paddingBottom: 200,
  },
  headerSection: {
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONTS.xlarge,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.sm,
    overflow: 'hidden',
  },
  cardContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  cardInfo: {
    flex: 1,
  },
  cardName: {
    fontSize: FONTS.medium,
    fontWeight: '600',
    color: COLORS.text,
  },
  cardCount: {
    fontSize: FONTS.small,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  deleteButton: {
    padding: SPACING.lg,
  },
  footer: {
    marginTop: SPACING.md,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    gap: SPACING.sm,
  },
  addButtonText: {
    fontSize: FONTS.medium,
    color: COLORS.primary,
    fontWeight: '500',
  },
  addCategoryForm: {
    backgroundColor: COLORS.surface,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
  },
  input: {
    backgroundColor: COLORS.surfaceLight,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    color: COLORS.text,
    fontSize: FONTS.regular,
    marginBottom: SPACING.md,
  },
  formActions: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  cancelButton: {
    flex: 1,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.surfaceLight,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: FONTS.regular,
    color: COLORS.textSecondary,
  },
  confirmButton: {
    flex: 1,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
  },
  confirmButtonText: {
    fontSize: FONTS.regular,
    fontWeight: '600',
    color: COLORS.black,
  },
  navSection: {
    position: 'absolute',
    bottom: 40,
    left: SPACING.lg,
    right: SPACING.lg,
    gap: SPACING.sm,
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    gap: SPACING.md,
  },
  navButtonText: {
    fontSize: FONTS.medium,
    color: COLORS.text,
    fontWeight: '500',
  },
});
