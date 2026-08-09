import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  TextInput,
  ScrollView,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getMultiplierModels, addMultiplierModel, deleteMultiplierModel } from '../../src/database/database';
import { MultiplierModel } from '../../src/types';
import { COLORS, SPACING, FONTS, BORDER_RADIUS } from '../../src/constants/theme';
import { randomUUID } from 'expo-crypto';

export default function MultipliersScreen() {
  const [models, setModels] = useState<MultiplierModel[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newValues, setNewValues] = useState('1, 2, 3, 5, 8, 10');

  useFocusEffect(
    useCallback(() => {
      loadModels();
    }, [])
  );

  async function loadModels() {
    const m = await getMultiplierModels();
    setModels(m);
  }

  async function handleCreate() {
    if (!newName.trim()) {
      Alert.alert('Erreur', 'Entrez un nom pour le modèle');
      return;
    }

    const values = newValues
      .split(',')
      .map(v => parseFloat(v.trim()))
      .filter(v => !isNaN(v) && v > 0);

    if (values.length === 0) {
      Alert.alert('Erreur', 'Entrez des valeurs valides séparées par des virgules');
      return;
    }

    try {
      await addMultiplierModel(randomUUID(), newName.trim(), values);
      setNewName('');
      setNewValues('1, 2, 3, 5, 8, 10');
      setShowCreate(false);
      await loadModels();
    } catch (e: any) {
      Alert.alert('Erreur', e.message || 'Impossible de créer le modèle');
    }
  }

  function handleDelete(model: MultiplierModel) {
    Alert.alert('Supprimer', `Supprimer le modèle "${model.name}" ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          await deleteMultiplierModel(model.id);
          loadModels();
        },
      },
    ]);
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={models}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <Text style={styles.title}>Modèles de multiplicateurs</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardInfo}>
              <Text style={styles.cardName}>{item.name}</Text>
              <Text style={styles.cardValues}>
                {item.values.map(v => `×${v}`).join(', ')}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => handleDelete(item)}
            >
              <Ionicons name="trash-outline" size={18} color={COLORS.error} />
            </TouchableOpacity>
          </View>
        )}
        ListFooterComponent={
          showCreate ? (
            <View style={styles.createForm}>
              <Text style={styles.formTitle}>Nouveau modèle</Text>
              <TextInput
                style={styles.input}
                placeholder="Nom du modèle"
                placeholderTextColor={COLORS.textMuted}
                value={newName}
                onChangeText={setNewName}
              />
              <TextInput
                style={styles.input}
                placeholder="Valeurs (ex: 1, 2, 3, 5, 8, 10)"
                placeholderTextColor={COLORS.textMuted}
                value={newValues}
                onChangeText={setNewValues}
                keyboardType="default"
              />
              <View style={styles.formActions}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => setShowCreate(false)}
                >
                  <Text style={styles.cancelButtonText}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.confirmButton}
                  onPress={handleCreate}
                >
                  <Text style={styles.confirmButtonText}>Créer</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => setShowCreate(true)}
            >
              <Ionicons name="add-circle" size={22} color={COLORS.primary} />
              <Text style={styles.addButtonText}>Créer un modèle</Text>
            </TouchableOpacity>
          )
        }
      />
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
  },
  title: {
    fontSize: FONTS.xlarge,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.lg,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.sm,
  },
  cardInfo: {
    flex: 1,
  },
  cardName: {
    fontSize: FONTS.medium,
    fontWeight: '600',
    color: COLORS.text,
  },
  cardValues: {
    fontSize: FONTS.small,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  deleteButton: {
    padding: SPACING.sm,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    marginTop: SPACING.md,
    gap: SPACING.sm,
  },
  addButtonText: {
    fontSize: FONTS.medium,
    color: COLORS.primary,
    fontWeight: '500',
  },
  createForm: {
    backgroundColor: COLORS.surface,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    marginTop: SPACING.md,
  },
  formTitle: {
    fontSize: FONTS.medium,
    fontWeight: '600',
    color: COLORS.primary,
    marginBottom: SPACING.md,
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
});
