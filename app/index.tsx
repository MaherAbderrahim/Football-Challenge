import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getCategories, getPlayerCount } from '../src/database/database';
import { Category } from '../src/types';
import { COLORS, SPACING, FONTS, BORDER_RADIUS } from '../src/constants/theme';

interface CategoryWithCount extends Category {
  playerCount: number;
}

export default function HomeScreen() {
  const router = useRouter();
  const [categories, setCategories] = useState<CategoryWithCount[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      loadCategories();
    }, [])
  );

  async function loadCategories() {
    try {
      const cats = await getCategories();
      const catsWithCount = await Promise.all(
        cats.map(async (cat) => ({
          ...cat,
          playerCount: await getPlayerCount(cat.id),
        }))
      );
      setCategories(catsWithCount);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  function handleCategoryPress(category: CategoryWithCount) {
    if (category.playerCount === 0) {
      alert('Cette catégorie n\'a pas encore de joueurs. Ajoutez des joueurs d\'abord.');
      return;
    }
    router.push({
      pathname: '/challenge-setup',
      params: { categoryId: category.id, categoryName: category.name },
    });
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Football_Challenge</Text>
        <Text style={styles.subtitle}>Choisissez une catégorie</Text>
      </View>

      <FlatList
        data={categories}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.categoryCard}
            onPress={() => handleCategoryPress(item)}
            activeOpacity={0.7}
          >
            <View style={styles.categoryInfo}>
              <Text style={styles.categoryName}>{item.name}</Text>
              <Text style={styles.categoryCount}>
                {item.playerCount} joueur{item.playerCount > 1 ? 's' : ''}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color={COLORS.textSecondary} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="football-outline" size={64} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>
              Aucune catégorie. {'\n'}Ajoutez-en une depuis l'administration.
            </Text>
          </View>
        }
      />

      <TouchableOpacity
        style={styles.adminButton}
        onPress={() => router.push('/admin')}
        activeOpacity={0.7}
      >
        <Ionicons name="settings-outline" size={20} color={COLORS.text} />
        <Text style={styles.adminButtonText}>Administration</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.xl,
  },
  title: {
    fontSize: FONTS.header,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  subtitle: {
    fontSize: FONTS.medium,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  list: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: 100,
  },
  categoryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.md,
  },
  categoryInfo: {
    flex: 1,
  },
  categoryName: {
    fontSize: FONTS.large,
    fontWeight: '600',
    color: COLORS.text,
  },
  categoryCount: {
    fontSize: FONTS.small,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyText: {
    fontSize: FONTS.medium,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: SPACING.lg,
  },
  adminButton: {
    position: 'absolute',
    bottom: 40,
    left: SPACING.xl,
    right: SPACING.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceLight,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    gap: SPACING.sm,
  },
  adminButtonText: {
    fontSize: FONTS.medium,
    color: COLORS.text,
    fontWeight: '500',
  },
});
