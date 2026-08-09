import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ScrollView,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  getPlayers,
  getMultiplierModels,
  getChallengeConfigs,
  addChallengeConfig,
  updateChallengeConfig,
  deleteChallengeConfig,
  updatePlayerOdds,
} from '../src/database/database';
import { Player, MultiplierModel, ChallengeConfig, ZoneConfig } from '../src/types';
import { COLORS, SPACING, FONTS, BORDER_RADIUS } from '../src/constants/theme';
import { randomUUID } from 'expo-crypto';

const DEFAULT_LAYOUT = {
  playerZone: { x: 50, y: 100, width: 150, height: 150 } as ZoneConfig,
  multiplierZone: { x: 20, y: 300, width: 80, height: 400 } as ZoneConfig,
  playerSize: 120,
};

export default function ChallengeSetupScreen() {
  const router = useRouter();
  const { categoryId, categoryName } = useLocalSearchParams<{
    categoryId: string;
    categoryName: string;
  }>();

  const [players, setPlayers] = useState<Player[]>([]);
  const [models, setModels] = useState<MultiplierModel[]>([]);
  const [configs, setConfigs] = useState<ChallengeConfig[]>([]);
  const [selectedModel, setSelectedModel] = useState<MultiplierModel | null>(null);
  const [selectedConfig, setSelectedConfig] = useState<ChallengeConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [configName, setConfigName] = useState('');

  const hasParams = !!categoryId && !!categoryName;

  useFocusEffect(
    useCallback(() => {
      if (hasParams) {
        loadData();
      } else {
        setLoading(false);
      }
    }, [categoryId, hasParams])
  );

  if (!hasParams) {
    return (
      <View style={styles.container}>
        <Text style={{ color: COLORS.text, padding: 40, textAlign: 'center' }}>
          Parametres manquants. Retournez a l'ecran precedent.
        </Text>
      </View>
    );
  }

  async function loadData() {
    try {
      const [p, m, c] = await Promise.all([
        getPlayers(categoryId!),
        getMultiplierModels(),
        getChallengeConfigs(),
      ]);
      setPlayers(p);
      setModels(m);
      setConfigs(c.filter(cfg => cfg.category_id === categoryId));

      if (m.length > 0 && !selectedModel) {
        setSelectedModel(m[0]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleOddsChange(playerId: string, newOdds: number) {
    if (newOdds < 0.1) newOdds = 0.1;
    if (newOdds > 100) newOdds = 100;
    await updatePlayerOdds(playerId, newOdds);
    setPlayers(prev =>
      prev.map(p => (p.id === playerId ? { ...p, odds: newOdds } : p))
    );
  }

  async function handleSaveConfig(name: string) {
    if (!selectedModel) return;

    const existingConfig = selectedConfig ? { ...selectedConfig } : null;
    const config: ChallengeConfig = {
      id: existingConfig?.id || randomUUID(),
      name,
      category_id: categoryId!,
      multiplier_model_id: selectedModel.id,
      layout: existingConfig?.layout || DEFAULT_LAYOUT,
      text_blocks: existingConfig?.text_blocks || [],
      created_at: existingConfig?.created_at || new Date().toISOString(),
    };

    if (existingConfig) {
      await updateChallengeConfig(config);
    } else {
      await addChallengeConfig(config);
    }

    setShowSaveModal(false);
    setConfigName('');
    Alert.alert('Succès', 'Configuration enregistrée', [
      { text: 'OK', onPress: () => startChallenge(config) },
    ]);
  }

  function startChallenge(config?: ChallengeConfig) {
    const cfg = config || selectedConfig;
    if (!cfg || !selectedModel) {
      Alert.alert('Info', 'Sélectionnez un modèle de multiplicateurs ou enregistrez une configuration');
      return;
    }

    router.push({
      pathname: '/camera',
      params: {
        categoryId: categoryId!,
        categoryName: categoryName!,
        modelId: selectedModel.id,
        modelValues: JSON.stringify(selectedModel.values),
        configId: cfg.id,
        configLayout: JSON.stringify(cfg.layout),
        configTextBlocks: JSON.stringify(cfg.text_blocks),
        configFrameStyle: cfg.frame_style ?? 'rounded',
      },
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
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.categoryTitle}>{categoryName}</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Modele de multiplicateurs</Text>
          {models.length === 0 ? (
            <Text style={styles.emptyText}>
              Aucun modele. Creez-en un dans l'administration.
            </Text>
          ) : (
            models.map((model) => (
              <TouchableOpacity
                key={model.id}
                style={[
                  styles.modelCard,
                  selectedModel?.id === model.id && styles.modelCardSelected,
                ]}
                onPress={() => setSelectedModel(model)}
              >
                <Text style={styles.modelName}>{model.name}</Text>
                <Text style={styles.modelValues}>
                  {model.values.map(v => `x${v}`).join(', ')}
                </Text>
              </TouchableOpacity>
            ))
          )}
        </View>

        {configs.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Configurations enregistrees</Text>
            {configs.map((cfg) => (
              <TouchableOpacity
                key={cfg.id}
                style={[
                  styles.configCard,
                  selectedConfig?.id === cfg.id && styles.configCardSelected,
                ]}
                onPress={() => {
                  setSelectedConfig(cfg);
                  const model = models.find(m => m.id === cfg.multiplier_model_id);
                  if (model) setSelectedModel(model);
                }}
              >
                <View style={styles.configInfo}>
                  <Text style={styles.configName}>{cfg.name}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    Alert.alert('Supprimer', `Supprimer "${cfg.name}" ?`, [
                      { text: 'Annuler', style: 'cancel' },
                      {
                        text: 'Supprimer',
                        style: 'destructive',
                        onPress: async () => {
                          await deleteChallengeConfig(cfg.id);
                          setConfigs(prev => prev.filter(c => c.id !== cfg.id));
                          if (selectedConfig?.id === cfg.id) {
                            setSelectedConfig(null);
                          }
                        },
                      },
                    ]);
                  }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="trash-outline" size={18} color={COLORS.error} />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cotes des joueurs ({players.length})</Text>
          <FlatList
            data={players}
            scrollEnabled={false}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={styles.playerRow}>
                <View style={styles.playerInfo}>
                  <Text style={styles.playerOdds}>x{item.odds.toFixed(1)}</Text>
                </View>
                <View style={styles.oddsControls}>
                  <TouchableOpacity
                    style={styles.oddsButton}
                    onPress={() => handleOddsChange(item.id, item.odds - 0.5)}
                  >
                    <Ionicons name="remove" size={20} color={COLORS.text} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.oddsButton}
                    onPress={() => handleOddsChange(item.id, item.odds + 0.5)}
                  >
                    <Ionicons name="add" size={20} color={COLORS.text} />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          />
        </View>
      </ScrollView>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionButton, styles.saveButton]}
          onPress={() => setShowSaveModal(true)}
        >
          <Ionicons name="save-outline" size={20} color={COLORS.text} />
          <Text style={styles.actionButtonText}>Enregistrer</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.startButton]}
          onPress={() => startChallenge()}
        >
          <Ionicons name="play" size={20} color={COLORS.black} />
          <Text style={[styles.actionButtonText, { color: COLORS.black }]}>
            Lancer le defi
          </Text>
        </TouchableOpacity>
      </View>

      <Modal visible={showSaveModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Nom de la configuration</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Ex: assists arabes"
              placeholderTextColor={COLORS.textMuted}
              value={configName}
              onChangeText={setConfigName}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setShowSaveModal(false);
                  setConfigName('');
                }}
              >
                <Text style={styles.modalCancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmButton, !configName.trim() && { opacity: 0.5 }]}
                onPress={() => {
                  if (configName.trim()) {
                    handleSaveConfig(configName.trim());
                  }
                }}
                disabled={!configName.trim()}
              >
                <Text style={styles.modalConfirmText}>Enregistrer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: SPACING.lg,
    paddingBottom: 120,
  },
  categoryTitle: {
    fontSize: FONTS.xlarge,
    fontWeight: 'bold',
    color: COLORS.primary,
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
  modelCard: {
    backgroundColor: COLORS.surface,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.sm,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  modelCardSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.surfaceLight,
  },
  modelName: {
    fontSize: FONTS.medium,
    fontWeight: '600',
    color: COLORS.text,
  },
  modelValues: {
    fontSize: FONTS.small,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  configCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.sm,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  configCardSelected: {
    borderColor: COLORS.accent,
  },
  configInfo: {
    flex: 1,
  },
  configName: {
    fontSize: FONTS.medium,
    color: COLORS.text,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.sm,
  },
  playerInfo: {
    flex: 1,
  },
  playerOdds: {
    fontSize: FONTS.large,
    fontWeight: 'bold',
    color: COLORS.accent,
  },
  oddsControls: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  oddsButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: FONTS.regular,
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },
  actions: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    padding: SPACING.lg,
    paddingBottom: SPACING.xl,
    backgroundColor: COLORS.background,
    gap: SPACING.md,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    gap: SPACING.sm,
  },
  saveButton: {
    backgroundColor: COLORS.surfaceLight,
  },
  startButton: {
    backgroundColor: COLORS.primary,
  },
  actionButtonText: {
    fontSize: FONTS.medium,
    fontWeight: '600',
    color: COLORS.text,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    padding: SPACING.xl,
    borderRadius: BORDER_RADIUS.xl,
    width: '100%',
  },
  modalTitle: {
    fontSize: FONTS.large,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: SPACING.lg,
  },
  modalInput: {
    backgroundColor: COLORS.surfaceLight,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    color: COLORS.text,
    fontSize: FONTS.regular,
    marginBottom: SPACING.lg,
  },
  modalActions: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  modalCancelButton: {
    flex: 1,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.surfaceLight,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: FONTS.regular,
    color: COLORS.textSecondary,
  },
  modalConfirmButton: {
    flex: 1,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
  },
  modalConfirmText: {
    fontSize: FONTS.regular,
    fontWeight: '600',
    color: COLORS.black,
  },
});
