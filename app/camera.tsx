import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  PanResponder,
  Alert,
  Modal,
  TextInput,
  ScrollView,
  NativeModules,
  Pressable,
  Platform,
  Linking,
  Share,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useFrameProcessor,
} from 'react-native-vision-camera';
import { useFaceDetector } from 'react-native-vision-camera-face-detector';
import { Worklets } from 'react-native-worklets-core';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { PermissionsAndroid } from 'react-native';
import {
  getPlayers,
  addSessionPhoto,
  addSessionVideo,
  getSessionVideos,
  getChallengeConfigs,
  updateChallengeConfig,
} from '../src/database/database';
import { Player, ZoneConfig, TextBlock } from '../src/types';
import { COLORS, SPACING, FONTS, BORDER_RADIUS } from '../src/constants/theme';
import {
  FrameStyleId,
  ACTIVE_FRAME_STYLE,
  FRAME_OPTIONS,
  FRAME_LABELS,
  FRAME_STORAGE_KEY,
  getFrameStyle,
  isFrameStyleId,
  computePlayerPhotoMetrics,
} from '../src/constants/frameStyles';
import { randomUUID } from 'expo-crypto';
import {
  clampFaceRect,
  smoothFaceRect,
  layoutFromFace,
  fallbackLayout,
  FaceRect,
} from '../src/utils/filterGeometry';

const { FilterCameraModule } = NativeModules;

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

function safeParse<T>(str: string, fallback: T): T {
  try { return JSON.parse(str); } catch { return fallback; }
}

type AppMode = 'challenge' | 'adjust' | 'history';

/**
 * Frame style variants for the player photo overlay.
 * (Definitions live in src/constants/frameStyles.ts.)
 */

/**
 * Renders a player photo with the active frame style.
 * `size` is the on-screen width/height (in px) used by the frame.
 *
 * The photo is displayed with `contain` inside the square frame: the whole
 * image (and therefore the full face) stays visible, proportions are kept,
 * nothing is deformed and nothing is cropped.
 */
function PlayerPhoto({ uri, size, frameStyleId }: { uri: string; size: number; frameStyleId: FrameStyleId }) {
  const fs = getFrameStyle(frameStyleId);
  const { innerSize, radius } = computePlayerPhotoMetrics(size, frameStyleId);

  const inner = (
    <Image
      source={{ uri }}
      style={[
        {
          width: innerSize,
          height: innerSize,
          resizeMode: 'contain' as const,
        },
        { ...fs.image, borderRadius: radius },
      ]}
    />
  );

  if (fs.wrapper) {
    return (
      <View
        style={[
          fs.wrapper,
          {
            width: size,
            height: size,
            alignItems: 'center',
            justifyContent: 'center',
          },
        ]}
      >
        {inner}
      </View>
    );
  }
  return inner;
}

export default function CameraScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    categoryId: string;
    categoryName: string;
    modelId: string;
    modelValues: string;
    configId: string;
    configLayout: string;
    configTextBlocks: string;
    configFrameStyle: string;
  }>();

  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('front');

  const [players, setPlayers] = useState<Player[]>([]);
  const [mode, setMode] = useState<AppMode>('challenge');

  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [sessionHistory, setSessionHistory] = useState<Player[]>([]);

  const multiplierValues: number[] = safeParse(params.modelValues || '[]', []);
  const configId = params.configId;

  const currentIndexRef = useRef(0);
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);
  const playersRef = useRef<Player[]>([]);
  useEffect(() => { playersRef.current = players; }, [players]);

  // Wheel animation state
  const isAnimatingRef = useRef(false);
  const wheelTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (wheelTimeoutRef.current) clearTimeout(wheelTimeoutRef.current);
    },
    []
  );

  const defaultLayout = fallbackLayout(SCREEN_WIDTH, SCREEN_HEIGHT);
  const parsedLayout: Record<string, any> = safeParse(params.configLayout || '{}', {});
  const [playerZone, setPlayerZone] = useState<ZoneConfig>(
    parsedLayout.playerZone || defaultLayout.playerZone
  );
  const [playerSize, setPlayerSize] = useState(
    parsedLayout.playerSize || defaultLayout.playerSize
  );
  const [multiplierZone, setMultiplierZone] = useState<ZoneConfig>(
    parsedLayout.multiplierZone || defaultLayout.multiplierZone
  );
  const [textBlocks, setTextBlocks] = useState<TextBlock[]>(
    safeParse(params.configTextBlocks || '[]', [])
  );

  const [showTextModal, setShowTextModal] = useState(false);
  const [newTextValue, setNewTextValue] = useState('');

  // Frame style: initialized from the saved challenge config, then overridden
  // by the user's last choice (AsyncStorage) so it survives app restarts.
  const [frameStyleId, setFrameStyleId] = useState<FrameStyleId>(
    isFrameStyleId(params.configFrameStyle) ? params.configFrameStyle : ACTIVE_FRAME_STYLE
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(FRAME_STORAGE_KEY);
        if (mounted && saved && isFrameStyleId(saved)) {
          setFrameStyleId(saved);
        }
      } catch {
        // storage unavailable — keep config value
      }
    })();
    return () => { mounted = false; };
  }, []);

  const selectFrameStyle = useCallback((fid: FrameStyleId) => {
    setFrameStyleId(fid);
    AsyncStorage.setItem(FRAME_STORAGE_KEY, fid).catch(() => {});
  }, []);

  // Recording
  const [isRecording, setIsRecording] = useState(false);
  const isRecordingRef = useRef(false);
  const [sessionVideos, setSessionVideos] = useState<string[]>([]);

  // Face tracking
  const [face, setFace] = useState<FaceRect | null>(null);
  const smoothFaceRef = useRef<FaceRect | null>(null);

  const setFaceOnJs = useRef(
    Worklets.createRunOnJS((rect: FaceRect | null) => {
      const clamped = clampFaceRect(rect, SCREEN_WIDTH, SCREEN_HEIGHT);
      smoothFaceRef.current = smoothFaceRect(smoothFaceRef.current, clamped, 0.4);
      setFace(smoothFaceRef.current);
    })
  ).current;

  const faceDetector = useFaceDetector({
    performanceMode: 'fast',
    trackingEnabled: true,
    autoMode: true,
    cameraFacing: 'front',
    windowWidth: SCREEN_WIDTH,
    windowHeight: SCREEN_HEIGHT,
    minFaceSize: 0.1,
  });

  const frameProcessor = useFrameProcessor(
    (frame) => {
      'worklet';
      try {
        const faces = faceDetector.detectFaces(frame);
        if (faces && faces.length > 0) {
          const f = faces[0];
          setFaceOnJs({
            x: f.bounds.x,
            y: f.bounds.y,
            width: f.bounds.width,
            height: f.bounds.height,
          });
        } else {
          setFaceOnJs(null);
        }
      } catch (e) {
        // detection errors are non-fatal
      }
    },
    [faceDetector]
  );

  // Stable refs for drag handlers
  const playerZoneRef = useRef(playerZone);
  useEffect(() => { playerZoneRef.current = playerZone; }, [playerZone]);

  // Effective layout: face-followed in challenge mode when a face is visible
  const followedLayout = useMemo(() => {
    if (mode !== 'challenge' || !face) return null;
    return layoutFromFace(face, SCREEN_WIDTH, SCREEN_HEIGHT, playerSize);
  }, [face, mode, playerSize]);

  const effPlayerZone = followedLayout ? followedLayout.playerZone : playerZone;
  const effPlayerSize = followedLayout ? followedLayout.playerSize : playerSize;

  useEffect(() => {
    loadPlayers();
    loadVideos();
    return () => {
      faceDetector.stopListeners?.();
      if (isRecordingRef.current) {
        FilterCameraModule?.stopRecording?.().catch(() => {});
      }
    };
  }, [params.categoryId]);

  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);

  async function loadPlayers() {
    const p = await getPlayers(params.categoryId!);
    setPlayers(p);
    if (p.length > 0) {
      setCurrentIndex(0);
      setSelectedPlayer(p[0]);
    }
  }

  async function loadVideos() {
    try {
      const videos = await getSessionVideos();
      setSessionVideos(videos.map(v => v.video_uri));
    } catch (e) {
      console.warn(e);
    }
  }

  const pickRandomPlayer = useCallback((): Player | null => {
    const list = playersRef.current;
    if (list.length === 0) return null;
    // True random draw WITH replacement: the source list is never modified,
    // repetitions are allowed (same player can appear several times in a row).
    return list[Math.floor(Math.random() * list.length)];
  }, []);

  const changePlayer = useCallback(() => {
    const list = playersRef.current;
    if (list.length === 0) return;
    if (isAnimatingRef.current) return; // ignore taps while a draw is running

    // 1. Draw the FINAL player first — the wheel always stops on it.
    const finalPlayer = pickRandomPlayer();
    if (!finalPlayer) return;
    const finalIndex = list.indexOf(finalPlayer);

    isAnimatingRef.current = true;

    // 2. Wheel animation: rapid successive players, progressively slowing
    //    down, stopping on the drawn player. Totally visible on screen so it
    //    is captured by the screen recording.
    let frame = 0;
    let delay = 45;

    const runFrame = () => {
      if (frame >= 18) {
        // 4. Stop on the final drawn player.
        currentIndexRef.current = finalIndex;
        setCurrentIndex(finalIndex);
        setSelectedPlayer(finalPlayer);
        setSessionHistory((prev) => [...prev, finalPlayer]);
        addSessionPhoto(finalPlayer.id, finalPlayer.image_uri).catch((e) => console.warn(e));
        isAnimatingRef.current = false;
        return;
      }
      frame += 1;
      const intermediate = pickRandomPlayer();
      if (intermediate) setSelectedPlayer(intermediate);
      delay = Math.round(delay * 1.08);
      wheelTimeoutRef.current = setTimeout(runFrame, delay);
    };

    runFrame();
  }, [pickRandomPlayer]);

  function resetChallenge() {
    if (players.length === 0) return;
    setCurrentIndex(0);
    currentIndexRef.current = 0;
    setSelectedPlayer(players[0]);
    setSessionHistory([]);
  }

  function handleAddText() {
    if (!newTextValue.trim()) return;
    const newBlock: TextBlock = {
      id: randomUUID(),
      text: newTextValue.trim(),
      x: SCREEN_WIDTH / 2 - 60,
      y: SCREEN_HEIGHT / 2,
      fontSize: 24,
      color: COLORS.white,
    };
    setTextBlocks(prev => [...prev, newBlock]);
    setNewTextValue('');
    setShowTextModal(false);
  }

  function removeTextBlock(id: string) {
    setTextBlocks(prev => prev.filter(b => b.id !== id));
  }

  function makeDraggable(
    getState: () => ZoneConfig,
    setState: (updater: (prev: ZoneConfig) => ZoneConfig) => void
  ) {
    const state = getState();
    let lastX = state.x;
    let lastY = state.y;

    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        const current = getState();
        lastX = current.x;
        lastY = current.y;
      },
      onPanResponderMove: (_, gs) => {
        setState(() => ({ x: lastX + gs.dx, y: lastY + gs.dy, width: getState().width, height: getState().height }));
      },
      onPanResponderRelease: () => {},
    });
  }

  const playerDrag = useMemo(
    () => makeDraggable(() => playerZoneRef.current, setPlayerZone),
    []
  );

  const ensureMicrophonePermission = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;
    const granted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    if (granted) return true;
    const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
      title: "Autorisation du microphone",
      message: "L'application a besoin du microphone pour enregistrer l'audio de la vidéo.",
      buttonPositive: "Autoriser",
      buttonNegative: "Refuser",
    } as any);
    return result === PermissionsAndroid.RESULTS.GRANTED;
  }, []);

  const startVideo = useCallback(async () => {
    try {
      const hasMic = await ensureMicrophonePermission();
      if (!hasMic) {
        Alert.alert(
          'Microphone requis',
          "L'enregistrement vidéo nécessite le microphone pour l'audio. " +
          "Vous pouvez changer cela dans les paramètres de l'application."
        );
        return;
      }
      const dir = `${FileSystem.cacheDirectory}recordings/`;
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      const path = `${dir}video_${Date.now()}.mp4`;
      await FilterCameraModule.startRecording(path);
      setIsRecording(true);
      isRecordingRef.current = true;
      if (players.length > 0) {
        setCurrentIndex(0);
        currentIndexRef.current = 0;
        setSelectedPlayer(players[0]);
      }
    } catch (e: any) {
      Alert.alert(
        'Erreur',
        e?.message ? String(e.message) : "Impossible de demarrer l'enregistrement"
      );
    }
  }, [ensureMicrophonePermission, players]);

  const stopVideo = useCallback(async () => {
    try {
      const srcPath = await FilterCameraModule.stopRecording();
      setIsRecording(false);
      if (!srcPath) throw new Error('Aucun fichier produit (enregistrement trop court ?)');
      const destDir = `${FileSystem.documentDirectory}videos/`;
      await FileSystem.makeDirectoryAsync(destDir, { intermediates: true });
      const dest = `${destDir}video_${Date.now()}.mp4`;
      await FilterCameraModule.moveRecordedFile(srcPath, dest);

      // The file must really exist on the device before we claim success.
      const info = await FileSystem.getInfoAsync(dest);
      if (!info.exists) {
        throw new Error("Le fichier video n'a pas ete cree sur l'appareil");
      }

      // Copy a real copy into the phone gallery / media store so the video
      // shows up in the device's Photos / Gallery apps, like a normal video.
      let galleryUri: string | null = null;
      if (Platform.OS === 'android' && FilterCameraModule?.saveToGallery) {
        if (Platform.Version && parseInt(String(Platform.Version), 10) < 29) {
          try {
            await PermissionsAndroid.request(
              PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE
            );
          } catch {
            // fall through — native side reports the real error
          }
        }
        try {
          galleryUri = await FilterCameraModule.saveToGallery(dest);
        } catch (e: any) {
          console.warn('saveToGallery failed', e);
        }
      }

      await addSessionVideo(selectedPlayer?.id ?? '', dest);
      setSessionVideos(v => [dest, ...v]);

      const galleryMessage =
        galleryUri != null
          ? 'Video enregistree dans la galerie du telephone (dossier FootMimo) avec le filtre.'
          : 'Video enregistree avec le filtre (copie dans la galerie indisponible sur cet appareil).';

      const buttons: any[] = [
        {
          text: 'OK',
        },
        {
          text: 'Partager',
          onPress: async () => {
            try {
              await Share.share(
                Platform.OS === 'android'
                  ? { url: 'file://' + dest, title: 'Football_Challenge' }
                  : { url: 'file://' + dest }
              );
            } catch {
              // user cancelled share — ignore
            }
          },
        },
      ];
      if (galleryUri != null) {
        buttons.unshift({
          text: 'Ouvrir la galerie',
          onPress: () => {
            const target =
              galleryUri.startsWith('content://') ? galleryUri : 'file://' + galleryUri;
            Linking.openURL(target).catch(() => {});
          },
        });
      }

      Alert.alert('Succès', galleryMessage, buttons);
    } catch (e: any) {
      setIsRecording(false);
      Alert.alert('Erreur', e?.message ? String(e.message) : "Erreur pendant l'arrêt de l'enregistrement");
    }
  }, [selectedPlayer]);

  const saveLayout = useCallback(async () => {
    if (!configId) {
      Alert.alert('Info', "Aucune configuration selectionnee. Enregistrez d'abord une configuration depuis l'ecran precedent.");
      return;
    }
    try {
      const configs = await getChallengeConfigs();
      const config = configs.find(c => c.id === configId);
      if (!config) {
        Alert.alert('Erreur', 'Configuration introuvable');
        return;
      }
      await updateChallengeConfig({
        ...config,
        layout: { playerZone, multiplierZone, playerSize },
        text_blocks: textBlocks,
        frame_style: frameStyleId,
      });
      Alert.alert('Succes', 'Filtre enregistre dans la configuration');
    } catch (e: any) {
      Alert.alert('Erreur', String(e?.message ?? e));
    }
  }, [configId, playerZone, multiplierZone, playerSize, textBlocks, frameStyleId]);

  if (!hasPermission) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="camera-outline" size={64} color={COLORS.textMuted} />
        <Text style={styles.permissionText}>
          L'acces a la camera est necessaire
        </Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Autoriser la camera</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.backLink} onPress={() => router.back()}>
          <Text style={styles.backLinkText}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="warning-outline" size={64} color={COLORS.textMuted} />
        <Text style={styles.permissionText}>Aucune camera disponible sur cet appareil</Text>
        <TouchableOpacity style={styles.backLink} onPress={() => router.back()}>
          <Text style={styles.backLinkText}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        style={styles.camera}
        device={device}
        isActive
        frameProcessor={frameProcessor}
        onError={(e) => console.warn('Camera error', e)}
      />

      {/* Full-screen tap zone: changes player while recording.
          Positionned just above the Camera (low z) so taps reach it,
          but it sits under the top bar / bottom button. */}
      {isRecording && (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={changePlayer}
          accessible={false}
          pointerEvents="auto"
        />
      )}

      {/* Player photo zone */}
      {mode === 'challenge' && (
        <View
          style={[
            styles.playerZone,
            {
              left: effPlayerZone.x,
              top: effPlayerZone.y,
              width: effPlayerSize,
              height: effPlayerSize,
            },
          ]}
          pointerEvents="none"
        >
          {selectedPlayer ? (
            <PlayerPhoto
              uri={selectedPlayer.image_uri}
              size={effPlayerSize}
              frameStyleId={frameStyleId}
            />
          ) : players.length > 0 ? (
            <PlayerPhoto
              uri={players[currentIndex]?.image_uri}
              size={effPlayerSize}
              frameStyleId={frameStyleId}
            />
          ) : null}
        </View>
      )}

      {/* Adjust mode: draggable player zone showing the real photo + frame */}
      {mode === 'adjust' && (
        <View
          {...playerDrag.panHandlers}
          style={[
            styles.dragZone,
            {
              left: playerZone.x,
              top: playerZone.y,
              width: playerSize,
              height: playerSize,
            },
          ]}
        >
          {selectedPlayer ? (
            <PlayerPhoto
              uri={selectedPlayer.image_uri}
              size={playerSize}
              frameStyleId={frameStyleId}
            />
          ) : players.length > 0 ? (
            <PlayerPhoto
              uri={players[currentIndex]?.image_uri}
              size={playerSize}
              frameStyleId={frameStyleId}
            />
          ) : null}
          <View style={styles.dragBadge} pointerEvents="none">
            <Ionicons name="move" size={13} color={COLORS.primary} />
            <Text style={styles.dragBadgeText}>Glisser</Text>
          </View>
        </View>
      )}

      {/* Frame style selector with real photo previews (adjust mode) */}
      {mode === 'adjust' && !isRecording && (
        <View style={styles.frameSelector}>
          <Text style={styles.frameSelectorTitle}>Style du cadre</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.frameRow}
          >
            {FRAME_OPTIONS.map((fid) => {
              const previewUri =
                selectedPlayer?.image_uri || players[currentIndex]?.image_uri;
              return (
                <TouchableOpacity
                  key={fid}
                  style={[
                    styles.frameOption,
                    frameStyleId === fid && styles.frameOptionActive,
                  ]}
                  onPress={() => selectFrameStyle(fid)}
                  activeOpacity={0.8}
                >
                  <View style={styles.frameThumb}>
                    {previewUri ? (
                      <PlayerPhoto uri={previewUri} size={48} frameStyleId={fid} />
                    ) : null}
                  </View>
                  <Text
                    style={[
                      styles.frameOptionText,
                      frameStyleId === fid && styles.frameOptionTextActive,
                    ]}
                  >
                    {FRAME_LABELS[fid]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Text blocks */}
      {textBlocks.map((block) => (
        <TouchableOpacity
          key={block.id}
          onLongPress={() => {
            if (mode === 'adjust') {
              Alert.alert('Supprimer ce texte ?', '', [
                { text: 'Annuler', style: 'cancel' },
                {
                  text: 'Supprimer',
                  style: 'destructive',
                  onPress: () => removeTextBlock(block.id),
                },
              ]);
            }
          }}
          style={[styles.textBlock, { left: block.x, top: block.y }]}
        >
          <Text
            style={[
              styles.textContent,
              { fontSize: block.fontSize, color: block.color },
            ]}
          >
            {block.text}
          </Text>
        </TouchableOpacity>
      ))}

      {/* Top bar (hidden while recording) */}
      {!isRecording && (
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.topBtn} onPress={() => router.back()}>
            <Ionicons name="close" size={28} color={COLORS.white} />
          </TouchableOpacity>

          <Text style={styles.catLabel}>{params.categoryName}</Text>

          <View style={styles.modeRow}>
            {(['challenge', 'adjust', 'history'] as AppMode[]).map((m) => (
              <TouchableOpacity
                key={m}
                style={[styles.modeBtn, mode === m && styles.modeBtnActive]}
                onPress={() => setMode(m)}
              >
                <Ionicons
                  name={
                    m === 'challenge' ? 'camera' : m === 'adjust' ? 'settings' : 'time'
                  }
                  size={20}
                  color={mode === m ? COLORS.black : COLORS.white}
                />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Adjust controls */}
      {mode === 'adjust' && !isRecording && (
        <View style={styles.adjustPanel}>
          <Text style={styles.adjustTitle}>Mode reglage</Text>
          <Text style={styles.adjustHint}>
            Glissez les zones pour les deplacer.{'\n'}Ajoutez du texte libre.
          </Text>

          <View style={styles.adjustRow}>
            <Text style={styles.adjustLabel}>Taille photo:</Text>
            <View style={styles.sizeRow}>
              <TouchableOpacity
                style={styles.sizeBtn}
                onPress={() => setPlayerSize(Math.max(60, playerSize - 10))}
              >
                <Ionicons name="remove" size={18} color={COLORS.text} />
              </TouchableOpacity>
              <Text style={styles.sizeVal}>{playerSize}</Text>
              <TouchableOpacity
                style={styles.sizeBtn}
                onPress={() => setPlayerSize(Math.min(300, playerSize + 10))}
              >
                <Ionicons name="add" size={18} color={COLORS.text} />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={styles.addTextBtn}
            onPress={() => setShowTextModal(true)}
          >
            <Ionicons name="text" size={20} color={COLORS.text} />
            <Text style={styles.addTextBtnLabel}>Ajouter du texte</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.saveLayoutBtn}
            onPress={saveLayout}
          >
            <Ionicons name="save-outline" size={20} color={COLORS.black} />
            <Text style={styles.saveLayoutBtnLabel}>Enregistrer la configuration</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* History panel */}
      {mode === 'history' && !isRecording && (
        <View style={styles.historyPanel}>
          <Text style={styles.historyTitle}>
            Photos et videos ({sessionHistory.length + sessionVideos.length})
          </Text>
          <ScrollView style={styles.historyScroll}>
            {sessionHistory.map((p: Player, i: number) => (
              <View key={`${p.id}-${i}`} style={styles.historyRow}>
                <Image source={{ uri: p.image_uri }} style={styles.historyThumb} />
              </View>
            ))}
            {sessionVideos.map((v) => (
              <View key={v} style={styles.historyRow}>
                <View style={[styles.historyThumb, styles.historyVideoThumb]}>
                  <Ionicons name="videocam" size={22} color={COLORS.white} />
                </View>
              </View>
            ))}
            {sessionHistory.length === 0 && sessionVideos.length === 0 && (
              <Text style={styles.historyEmpty}>
                Aucune photo ou video pour cette session
              </Text>
            )}
          </ScrollView>
        </View>
      )}

      {/* Bottom bar: single record/stop button */}
      {mode === 'challenge' && (
        <View style={styles.bottomBar}>
          {!isRecording ? (
            <>
              {players.length > 1 && (
                <TouchableOpacity style={styles.resetBtn} onPress={resetChallenge}>
                  <Ionicons name="refresh" size={24} color={COLORS.text} />
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.spinBtn, players.length === 0 && styles.spinBtnDisabled]}
                onPress={startVideo}
                disabled={players.length === 0}
              >
                <View style={styles.recordDotBig} />
                <Text style={styles.spinBtnText}>ENREGISTRER</Text>
              </TouchableOpacity>

              <View style={styles.resetBtnPlaceholder} />
            </>
          ) : (
            <TouchableOpacity
              style={[styles.spinBtn, styles.stopBtnBig, styles.stopBtnInvisible]}
              onPress={stopVideo}
              activeOpacity={1}
              accessible={false}
            >
              <View style={styles.stopSquare} />
              <Text style={styles.spinBtnText}>ARRÊTER</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Add text modal */}
      <Modal visible={showTextModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Texte a afficher</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Ex: 11 000 assists"
              placeholderTextColor={COLORS.textMuted}
              value={newTextValue}
              onChangeText={setNewTextValue}
              autoFocus
            />
            <View style={styles.modalRow}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => {
                  setShowTextModal(false);
                  setNewTextValue('');
                }}
              >
                <Text style={styles.modalCancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalConfirm,
                  !newTextValue.trim() && { opacity: 0.5 },
                ]}
                onPress={handleAddText}
                disabled={!newTextValue.trim()}
              >
                <Text style={styles.modalConfirmText}>Ajouter</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.black },
  centerContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  camera: { flex: 1 },
  playerZone: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  textBlock: { position: 'absolute' },
  textContent: {
    fontWeight: 'bold',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 4,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  topBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  catLabel: { fontSize: FONTS.medium, fontWeight: '600', color: COLORS.white },
  modeRow: { flexDirection: 'row', gap: SPACING.sm },
  modeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeBtnActive: { backgroundColor: COLORS.primary },
  adjustPanel: {
    position: 'absolute',
    bottom: 100,
    left: SPACING.lg,
    right: SPACING.lg,
    backgroundColor: 'rgba(0,0,0,0.8)',
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
  },
  adjustTitle: {
    fontSize: FONTS.large,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginBottom: SPACING.sm,
  },
  adjustHint: {
    fontSize: FONTS.small,
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
  },
  adjustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  adjustLabel: { fontSize: FONTS.regular, color: COLORS.text },
  sizeRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  sizeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sizeVal: {
    fontSize: FONTS.medium,
    color: COLORS.text,
    minWidth: 40,
    textAlign: 'center',
  },
  addTextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceLight,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  addTextBtnLabel: { fontSize: FONTS.regular, color: COLORS.text },
  saveLayoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    gap: SPACING.sm,
  },
  saveLayoutBtnLabel: {
    fontSize: FONTS.regular,
    fontWeight: '600',
    color: COLORS.black,
  },
  dragZone: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: COLORS.primary,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  dragBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  dragBadgeText: { fontSize: 11, color: COLORS.primary, fontWeight: '600' },
  frameSelector: {
    position: 'absolute',
    top: 130,
    left: SPACING.lg,
    right: SPACING.lg,
    backgroundColor: 'rgba(0,0,0,0.82)',
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
  },
  frameSelectorTitle: {
    fontSize: FONTS.small,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  frameRow: { flexDirection: 'row', gap: SPACING.sm },
  frameOption: {
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xs,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.surfaceLight,
  },
  frameOptionActive: { backgroundColor: COLORS.primary },
  frameThumb: {
    width: 62,
    height: 62,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  frameOptionText: { fontSize: 11, color: COLORS.text, marginTop: 4 },
  frameOptionTextActive: { color: COLORS.black, fontWeight: 'bold' },
  historyPanel: {
    position: 'absolute',
    top: 100,
    left: SPACING.lg,
    right: SPACING.lg,
    bottom: 100,
    backgroundColor: 'rgba(0,0,0,0.85)',
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
  },
  historyTitle: {
    fontSize: FONTS.medium,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginBottom: SPACING.md,
  },
  historyScroll: { flex: 1 },
  historyRow: { marginBottom: SPACING.sm },
  historyThumb: { width: 60, height: 60, borderRadius: BORDER_RADIUS.md },
  historyVideoThumb: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyEmpty: {
    fontSize: FONTS.regular,
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xl,
    paddingHorizontal: SPACING.xxl,
    paddingBottom: 50,
    gap: SPACING.xl,
  },
  resetBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinBtnDisabled: { backgroundColor: COLORS.textMuted },
  spinBtnText: {
    fontSize: FONTS.medium,
    fontWeight: 'bold',
    color: COLORS.black,
  },
  stopBtnBig: {
    backgroundColor: COLORS.error,
  },
  stopBtnInvisible: {
    opacity: 0,
    backgroundColor: 'transparent',
    shadowOpacity: 0,
    elevation: 0,
  },
  recordDotBig: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.error,
    marginBottom: 2,
  },
  stopSquare: {
    width: 18,
    height: 18,
    backgroundColor: COLORS.white,
    marginBottom: 2,
  },
  resetBtnPlaceholder: { width: 50, height: 50 },
  permissionText: {
    fontSize: FONTS.medium,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING.lg,
  },
  permissionButton: {
    marginTop: SPACING.lg,
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
  },
  permissionButtonText: {
    fontSize: FONTS.medium,
    fontWeight: '600',
    color: COLORS.black,
  },
  backLink: { marginTop: SPACING.md },
  backLinkText: { fontSize: FONTS.regular, color: COLORS.textSecondary },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  modalBox: {
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
  modalRow: { flexDirection: 'row', gap: SPACING.md },
  modalCancel: {
    flex: 1,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.surfaceLight,
    alignItems: 'center',
  },
  modalCancelText: { fontSize: FONTS.regular, color: COLORS.textSecondary },
  modalConfirm: {
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
