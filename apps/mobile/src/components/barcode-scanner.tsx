import { CameraView, useCameraPermissions } from 'expo-camera';
import type { ComponentType } from 'react';
import { useRef, useState } from 'react';
import { Modal, Platform, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { tokens } from '@anbaro/design-tokens';

import { PrimaryButton, SecondaryButton } from './ui';

// pnpm resolves a second @types/react for expo-camera, which breaks class-component
// JSX checking. Re-typing the view with the props we use keeps checking sound here.
const Camera = CameraView as unknown as ComponentType<{
  barcodeScannerSettings: { barcodeTypes: string[] };
  enableTorch: boolean;
  onBarcodeScanned: (result: { data: string }) => void;
  style: StyleProp<ViewStyle>;
}>;

/**
 * Full-screen barcode scan modal. Debounces to the first read and hands the
 * raw value back; the caller decides whether it is a lookup or a new-item fill.
 * Camera scanning is unavailable on web builds — callers should hide the
 * trigger there (Platform.OS === 'web').
 */
export function BarcodeScannerModal({
  onClose,
  onScanned,
  visible,
}: {
  onClose: () => void;
  onScanned: (barcode: string) => void;
  visible: boolean;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const handled = useRef(false);
  const [torch, setTorch] = useState(false);

  if (!visible) return null;
  const grantNeeded = !permission?.granted;
  return (
    <Modal animationType="slide" onRequestClose={onClose} visible={visible}>
      <View style={styles.container}>
        {grantNeeded ? (
          <View style={styles.permission}>
            <Text style={styles.title}>Camera access needed</Text>
            <Text style={styles.detail}>
              Anbaro scans item barcodes for instant lookup. Your camera is never used for
              anything else.
            </Text>
            {permission?.canAskAgain === false ? (
              <Text style={styles.detail}>
                Enable camera access for Anbaro in your device settings, then try again.
              </Text>
            ) : (
              <PrimaryButton onPress={() => void requestPermission()}>Allow camera</PrimaryButton>
            )}
            <SecondaryButton onPress={onClose}>Cancel</SecondaryButton>
          </View>
        ) : (
          <>
            <Camera
              barcodeScannerSettings={{
                barcodeTypes: [
                  'ean13',
                  'ean8',
                  'upc_a',
                  'upc_e',
                  'code128',
                  'code39',
                  'itf14',
                  'qr',
                ],
              }}
              enableTorch={torch}
              onBarcodeScanned={({ data }) => {
                if (handled.current || !data) return;
                handled.current = true;
                onScanned(data);
              }}
              style={StyleSheet.absoluteFill}
            />
            <View pointerEvents="none" style={styles.frameWrap}>
              <View style={styles.frame} />
              <Text style={styles.hint}>Point the camera at a barcode or QR code</Text>
            </View>
            <View style={styles.actions}>
              {Platform.OS !== 'web' ? (
                <SecondaryButton onPress={() => setTorch((value) => !value)}>
                  {torch ? 'Torch off' : 'Torch on'}
                </SecondaryButton>
              ) : null}
              <SecondaryButton onPress={onClose}>Cancel</SecondaryButton>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  actions: {
    bottom: 40,
    flexDirection: 'row',
    gap: tokens.spacing[3],
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
  },
  container: { backgroundColor: '#1E1E24', flex: 1 },
  detail: {
    color: tokens.color.textMuted,
    fontSize: tokens.typography.fontSize.md,
    lineHeight: 24,
    textAlign: 'center',
  },
  frame: {
    borderColor: '#FFFFFF',
    borderRadius: tokens.radius.lg,
    borderWidth: 3,
    height: 220,
    width: 280,
  },
  frameWrap: { alignItems: 'center', flex: 1, gap: tokens.spacing[4], justifyContent: 'center' },
  hint: { color: '#FFFFFF', fontSize: tokens.typography.fontSize.md, fontWeight: '600' },
  permission: {
    alignItems: 'stretch',
    backgroundColor: tokens.color.canvas,
    flex: 1,
    gap: tokens.spacing[4],
    justifyContent: 'center',
    padding: tokens.spacing[6],
  },
  title: {
    color: tokens.color.text,
    fontSize: tokens.typography.fontSize.xl,
    fontWeight: '700',
    textAlign: 'center',
  },
});
