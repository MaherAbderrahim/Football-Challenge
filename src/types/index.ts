export interface Category {
  id: string;
  name: string;
  created_at: string;
}

export interface Player {
  id: string;
  category_id: string;
  image_uri: string;
  odds: number;
  created_at: string;
}

export interface MultiplierModel {
  id: string;
  name: string;
  values: number[];
  created_at: string;
}

export interface ChallengeConfig {
  id: string;
  name: string;
  category_id: string;
  multiplier_model_id: string;
  layout: LayoutConfig;
  text_blocks: TextBlock[];
  frame_style?: string;
  created_at: string;
}

export interface LayoutConfig {
  playerZone: ZoneConfig;
  multiplierZone: ZoneConfig;
  playerSize: number;
}

export interface ZoneConfig {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextBlock {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
}

export interface SessionPhoto {
  player_id: string;
  image_uri: string;
  timestamp: number;
}
