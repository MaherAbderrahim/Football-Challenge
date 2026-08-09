import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getCategories } from '../../src/database/database';
import { pickAndImportImages } from '../../src/utils/googleDrive';
import { Category } from '../../src/types';
import { COLORS, SPACING, FONTS, BORDER_RADIUS } from '../../src/constants/theme';

export default function ImportScreen() {
  const params = useLocalSearchParams<{ categoryId?: string }>();
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState(params.categoryId || '');
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  useFocusEffect(
    useCallback(() => {
      loadCategories();
    }, [])
  );

  async function loadCategories() {
    const cats = await getCategories();
    setCategories(cats);
    if (!selectedCategoryId && cats.length > 0) {
      setSelectedCategoryId(cats[0].id);
    }
  }

  async function handleLocalImport() {
    if (!selectedCategoryId) {
      Alert.alert('Erreur', 'Selectionnez une categorie');
      return;
    }

    setImporting(true);
    setProgress({ current: 0, total: 0 });
    try {
      const count = await pickAndImportImages(
        selectedCategoryId,
        (current, total) => setProgress({ current, total })
      );
      if (count > 0) {
        Alert.alert('Succes', `${count} joueur(s) importe(s)`);
      }
    } catch (e: any) {
      Alert.alert('Erreur', e.message || "Echec de l'import");
    } finally {
      setImporting(false);
      setProgress({ current: 0, total: 0 });
    }
  }

  async function handleOpenDrive() {
    Alert.alert(
      'Importer depuis Google Drive',
      "Ouvrez le dossier Google Drive dans votre navigateur, telechargez les images dans votre galerie, puis utilisez 'Importer depuis la galerie'.",
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Ouvrir Drive',
          onPress: () => Linking.openURL('https://drive.google.com/drive/folders/1vlHORxVekpo_UWJIqQ1zE0PE1FskWaM0'),
        },
      ]
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Importer des joueurs</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Categorie cible</Text>
        {categories.map(cat => (
          <TouchableOpacity
            key={cat.id}
            style={[
              styles.categoryOption,
              selectedCategoryId === cat.id && styles.categoryOptionSelected,
            ]}
            onPress={() => setSelectedCategoryId(cat.id)}
          >
            <Text style={styles.categoryOptionText}>{cat.name}</Text>
          </TouchableOpacity>
        ))}
        {categories.length === 0 && (
          <Text style={styles.emptyText}>
            Creez d'abord une categorie dans Administration
          </Text>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Depuis la galerie</Text>
        <Text style={styles.hint}>
          Selectionnez plusieurs images depuis votre appareil.
        </Text>
        <TouchableOpacity
          style={[styles.importButton, importing && styles.importButtonDisabled]}
          onPress={handleLocalImport}
          disabled={importing || !selectedCategoryId}
        >
          {importing ? (
            <ActivityIndicator color={COLORS.black} />
          ) : (
            <>
              <Ionicons name="images-outline" size={20} color={COLORS.black} />
              <Text style={styles.importButtonText}>Choisir des photos</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Depuis Google Drive</Text>
        <Text style={styles.hint}>
          Ouvrez le dossier Drive, telechargez les images dans votre galerie, puis importez-les.
        </Text>
        <TouchableOpacity
          style={[styles.importButton, styles.driveButton]}
          onPress={handleOpenDrive}
        >
          <Ionicons name="cloud-outline" size={20} color={COLORS.text} />
          <Text style={[styles.importButtonText, { color: COLORS.text }]}>
            Ouvrir le dossier Drive
          </Text>
        </TouchableOpacity>
      </View>

      {importing && progress.total > 0 && (
        <View style={styles.progressSection}>
          <Text style={styles.progressText}>
            Importation: {progress.current} / {progress.total}
          </Text>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                { width: `${(progress.current / progress.total) * 100}%` },
              ]}
            />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: SPACING.lg,
  },
  title: {
    fontSize: FONTS.xlarge,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.xl,
  },
  section: {
    marginBottom: SPACING.xl,
  },
  sectionTitle: {
    fontSize: FONTS.medium,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  hint: {
    fontSize: FONTS.small,
    color: COLORS.textMuted,
    marginBottom: SPACING.md,
  },
  categoryOption: {
    backgroundColor: COLORS.surface,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.sm,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  categoryOptionSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.surfaceLight,
  },
  categoryOptionText: {
    fontSize: FONTS.regular,
    color: COLORS.text,
  },
  importButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    gap: SPACING.sm,
  },
  driveButton: {
    backgroundColor: COLORS.surfaceLight,
  },
  importButtonDisabled: {
    opacity: 0.5,
  },
  importButtonText: {
    fontSize: FONTS.regular,
    fontWeight: '600',
    color: COLORS.black,
  },
  emptyText: {
    fontSize: FONTS.regular,
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },
  progressSection: {
    marginTop: SPACING.lg,
  },
  progressText: {
    fontSize: FONTS.regular,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  progressBar: {
    height: 6,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 3,
  },
});
