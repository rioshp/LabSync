import type { Coordinates } from '@/lib/location';
import type { Lab } from './types';

export type MapSceneProps = {
  labs?: Lab[];
  centerPicker?: boolean;
  onMovingChange?: (moving: boolean) => void;
  onTouchChange?: (touching: boolean) => void;
  selectedLabId?: string | null;
  onSelectLab?: (labId: string) => void;
  userLocation?: Coordinates | null;
  draft?: (Coordinates & { radiusMeters: number }) | null;
  onSelectPoint?: (point: Coordinates) => void;
  focusPoint?: Coordinates | null;
};
