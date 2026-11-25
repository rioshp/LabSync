import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  ViewAnnotation,
  type CameraRef,
} from '@maplibre/maplibre-react-native';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BrandColors } from '@/constants/theme';
import {
  createRadiusFeature,
  fromMapCoordinate,
  metersPerMapPoint,
  toMapCoordinate,
  zoomForRadius,
} from './map-geometry';
import { OPENFREEMAP_STYLE_URL } from './map-style';
import type { MapSceneProps } from './map-scene.types';

export default function MapScene({
  labs = [],
  selectedLabId,
  onSelectLab,
  userLocation,
  draft,
  onSelectPoint,
  focusPoint,
  centerPicker = false,
  onMovingChange,
  onTouchChange,
}: MapSceneProps) {
  const camera = useRef<CameraRef>(null);
  const dragging = useRef(false);
  const movedByUser = useRef(false);
  const positioned = useRef(false);
  const lastFocus = useRef(focusPoint);
  const liveCenter = useRef(draft ?? focusPoint ?? userLocation ?? labs[0] ?? null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [mapScale, setMapScale] = useState({ latitude: 0, zoom: 4 });
  const suppressPressUntil = useRef(0);
  const [ready, setReady] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [slowAttempt, setSlowAttempt] = useState(-1);
  const [initialViewState] = useState(() => ({
    center: toMapCoordinate(draft ?? labs[0] ?? userLocation ?? { latitude: -2.5, longitude: 118 }),
    zoom: draft || labs.length || userLocation ? 18 : 4,
  }));

  useEffect(() => {
    const timer = setTimeout(() => setSlowAttempt(attempt), 12_000);
    return () => clearTimeout(timer);
  }, [attempt]);
  useEffect(() => {
    if (!ready || !viewport.width || !viewport.height) return;
    const explicitFocus = !!focusPoint && focusPoint !== lastFocus.current;
    const firstPosition = !positioned.current && !movedByUser.current;
    const target = explicitFocus
      ? focusPoint
      : firstPosition
        ? focusPoint ?? draft ?? userLocation ?? labs[0]
        : null;
    if (!target) return;
    const radius = draft?.radiusMeters ?? 50;
    // Moving the selection updates data only; it must never issue a camera command.
    // Keep zoom unchanged when the radius field changes so smaller radii look smaller.
    // Fit the initial/recenter view only, with enough surrounding building context.
    positioned.current = true;
    lastFocus.current = focusPoint;
    liveCenter.current = target;
    camera.current?.easeTo({
      center: toMapCoordinate(target),
      zoom: centerPicker
        ? zoomForRadius(target.latitude, Math.max(50, radius), Math.min(viewport.width, viewport.height))
        : 18,
      duration: 350,
    });
  }, [ready, viewport, focusPoint, draft, userLocation, labs, centerPicker]);

  const area = draft ?? labs.find((lab) => lab.id === selectedLabId);
  const radiusFeature = !centerPicker && area ? createRadiusFeature(area, area.radiusMeters) : null;
  // A screen overlay stays attached to the center pin during native pan/inertia.
  // Its size still represents geographic meters and follows pinch zoom/latitude.
  const pickerDiameter = draft
    ? 2 * draft.radiusMeters / metersPerMapPoint(mapScale.latitude, mapScale.zoom)
    : 0;
  const showError = failed || slowAttempt === attempt;

  function retry() {
    positioned.current = false;
    movedByUser.current = false;
    setReady(false);
    setLoaded(false);
    setFailed(false);
    setAttempt((value) => value + 1);
  }

  return (
    <View
      style={[styles.frame, centerPicker && styles.pickerFrame]}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setViewport((previous) => previous.width === width && previous.height === height
          ? previous : { width, height });
      }}
      onTouchStart={() => onTouchChange?.(true)}
      onTouchEnd={(event) => onTouchChange?.(event.nativeEvent.touches.length > 0)}
      onTouchCancel={() => onTouchChange?.(false)}
    >
      <Map
        key={attempt}
        style={StyleSheet.absoluteFill}
        mapStyle={OPENFREEMAP_STYLE_URL}
        attribution
        androidView="texture"
        touchRotate={false}
        touchPitch={false}
        onDidFinishLoadingStyle={() => setReady(true)}
        onDidFinishLoadingMap={() => {
          setLoaded(true);
          setFailed(false);
        }}
        onDidFailLoadingMap={() => {
          setLoaded(false);
          setFailed(true);
        }}
        onRegionWillChange={(event) => {
          if (centerPicker) onMovingChange?.(true);
          if (event.nativeEvent.userInteraction) {
            movedByUser.current = true;
            positioned.current = true;
            // Reserve the selection before a delayed first GPS sample arrives.
            if (centerPicker) onSelectPoint?.(fromMapCoordinate(event.nativeEvent.center));
          }
        }}
        onRegionIsChanging={(event) => {
          liveCenter.current = fromMapCoordinate(event.nativeEvent.center);
          if (centerPicker) {
            setMapScale({ latitude: event.nativeEvent.center[1], zoom: event.nativeEvent.zoom });
          }
        }}
        onRegionDidChange={(event) => {
          liveCenter.current = fromMapCoordinate(event.nativeEvent.center);
          if (!centerPicker) return;
          setMapScale({ latitude: event.nativeEvent.center[1], zoom: event.nativeEvent.zoom });
          suppressPressUntil.current = Date.now() + 200;
          // Commit only after native panning and inertia have stopped.
          if (positioned.current || movedByUser.current) {
            onSelectPoint?.(liveCenter.current);
          }
          onMovingChange?.(false);
        }}
        onPress={
          onSelectPoint
            ? (event) => {
                if (!dragging.current && Date.now() >= suppressPressUntil.current) {
                  const point = fromMapCoordinate(event.nativeEvent.lngLat);
                  movedByUser.current = true;
                  if (centerPicker) {
                    positioned.current = true;
                    camera.current?.easeTo({ center: event.nativeEvent.lngLat, duration: 300 });
                  } else onSelectPoint(point);
                }
              }
            : undefined
        }
      >
        <Camera ref={camera} initialViewState={initialViewState} />
        {radiusFeature ? (
          <GeoJSONSource id="lab-radius" data={radiusFeature}>
            <Layer
              id="lab-radius-fill"
              type="fill"
              paint={{ 'fill-color': BrandColors.ink, 'fill-opacity': 0.1 }}
            />
            <Layer
              id="lab-radius-border"
              type="line"
              paint={{ 'line-color': BrandColors.ink, 'line-width': 2 }}
            />
          </GeoJSONSource>
        ) : null}
        {labs.map((lab) => (
          <ViewAnnotation
            key={lab.id}
            id={`lab-${lab.id}`}
            lngLat={toMapCoordinate(lab)}
            anchor="left"
            offset={[-11, 0]}
            title={lab.name}
            selected={lab.id === selectedLabId}
            onPress={(event) => {
              event.stopPropagation();
              onSelectLab?.(lab.id);
            }}
          >
            <View collapsable={false} accessibilityLabel={lab.name} style={styles.labMarker}>
              <View style={styles.labPin} />
              <Text numberOfLines={1} style={styles.labLabel}>
                {lab.name}
              </Text>
            </View>
          </ViewAnnotation>
        ))}
        {draft && !centerPicker ? (
          <ViewAnnotation
            id="lab-draft"
            lngLat={toMapCoordinate(draft)}
            title="Pusat laboratorium"
            draggable
            onPress={(event) => event.stopPropagation()}
            onDragStart={() => {
              dragging.current = true;
            }}
            onDragEnd={(event) => {
              dragging.current = false;
              suppressPressUntil.current = Date.now() + 250;
              onSelectPoint?.(fromMapCoordinate(event.nativeEvent.lngLat));
            }}
          >
            <View
              collapsable={false}
              accessibilityLabel="Pin lokasi laboratorium, tahan untuk menggeser"
              style={styles.draftPin}
            />
          </ViewAnnotation>
        ) : null}
        {userLocation ? (
          <ViewAnnotation
            id="user-location"
            lngLat={toMapCoordinate(userLocation)}
            title="Posisi saya"
            onPress={(event) => event.stopPropagation()}
          >
            <View collapsable={false} accessibilityLabel="Posisi saya" style={styles.userPin} />
          </ViewAnnotation>
        ) : null}
      </Map>
      {centerPicker && draft ? (
        <View
          pointerEvents="none"
          style={[styles.pickerRadius, {
            width: pickerDiameter,
            height: pickerDiameter,
            borderRadius: pickerDiameter / 2,
            marginLeft: -pickerDiameter / 2,
            marginTop: -pickerDiameter / 2,
          }]}
        />
      ) : null}
      {centerPicker ? (
        <View pointerEvents="none" style={styles.centerOverlay}>
          <View style={styles.centerPin}><View style={styles.pinHole} /></View>
          <View style={styles.pinTip} />
          <View style={styles.pinShadow} />
        </View>
      ) : null}
      {!loaded ? (
        <View style={styles.status} pointerEvents={showError ? 'auto' : 'none'}>
          <Text style={styles.statusText}>
            {showError
              ? 'Peta belum tersedia. Periksa koneksi; daftar lab dan input koordinat tetap dapat digunakan.'
              : 'Memuat peta…'}
          </Text>
          {showError ? (
            <Pressable accessibilityRole="button" onPress={retry} style={styles.retry}>
              <Text style={styles.retryText}>Muat ulang peta</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { height: 350, borderRadius: 20, overflow: 'hidden', backgroundColor: BrandColors.soft },
  pickerFrame: { height: 400 },
  pickerRadius: {
    position: 'absolute', left: '50%', top: '50%',
    borderWidth: 2, borderColor: '#1769E0', backgroundColor: '#1769E018',
  },
  centerOverlay: {
    position: 'absolute', left: '50%', top: '50%',
    width: 40, height: 54, marginLeft: -20, marginTop: -48, alignItems: 'center',
  },
  centerPin: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#1769E0',
    borderWidth: 3, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
  },
  pinHole: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FFFFFF' },
  pinTip: {
    marginTop: -4, width: 0, height: 0,
    borderLeftWidth: 8, borderRightWidth: 8, borderTopWidth: 14,
    borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: '#1769E0',
  },
  pinShadow: { width: 10, height: 4, borderRadius: 5, backgroundColor: '#00000030' },
  // Anchor the dot at the coordinate even when labels have different lengths.
  labMarker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  labLabel: {
    maxWidth: 160,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#FFFFFFE6',
    color: BrandColors.ink,
    fontSize: 12,
    fontWeight: '700',
  },
  labPin: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 3,
    borderColor: BrandColors.paper,
    backgroundColor: BrandColors.ink,
  },
  draftPin: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 4,
    borderColor: BrandColors.paper,
    backgroundColor: BrandColors.ink,
  },
  userPin: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 3,
    borderColor: BrandColors.paper,
    backgroundColor: '#208AEF',
  },
  status: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    backgroundColor: BrandColors.paper,
    borderRadius: 12,
    padding: 10,
  },
  statusText: { color: BrandColors.ink, fontSize: 12, lineHeight: 18 },
  retry: { alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 4 },
  retryText: {
    color: BrandColors.ink,
    fontSize: 12,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});
