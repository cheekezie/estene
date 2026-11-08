import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useRef, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius } from '@estene/theme/tokens';
import { Button, Field, T, space } from './ui';

/**
 * Full-screen QR scanner for Estene parcel tags, with typed entry as a
 * fallback (damaged tag, no camera permission).
 */
export function TagScanner({
  visible,
  title,
  onScanned,
  onClose,
}: {
  visible: boolean;
  title: string;
  onScanned: (code: string) => void;
  onClose: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [manual, setManual] = useState('');
  const done = useRef(false);

  const finish = (code: string) => {
    if (done.current) return;
    done.current = true;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onScanned(code.trim().toUpperCase());
    setManual('');
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onShow={() => {
        done.current = false;
      }}
      onRequestClose={onClose}
    >
      <SafeAreaView style={s.wrap}>
        <T size={20} weight="800" style={{ color: colors.primaryForeground }}>
          {title}
        </T>
        <View style={s.cameraBox}>
          {permission?.granted ? (
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={visible ? ({ data }) => finish(data) : undefined}
            />
          ) : (
            <View style={s.permission}>
              <T style={{ color: colors.primaryForeground, textAlign: 'center' }}>
                Allow the camera to scan the parcel’s QR tag.
              </T>
              <Button
                title="Allow camera"
                variant="accent"
                onPress={() => void requestPermission()}
              />
            </View>
          )}
          <View pointerEvents="none" style={s.frame} />
        </View>
        <View style={s.manual}>
          <Field
            label="Or type the tag code"
            value={manual}
            onChangeText={setManual}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="e.g. EST7K2M9Q"
            returnKeyType="done"
            onSubmitEditing={() => manual.trim().length >= 6 && finish(manual)}
          />
          <Button
            title="Use this code"
            variant="accent"
            disabled={manual.trim().length < 6}
            onPress={() => finish(manual)}
          />
          <Button title="Cancel" variant="outline" onPress={onClose} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.brandNavy, padding: space.lg, gap: space.lg },
  cameraBox: {
    flex: 1,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: colors.foreground,
  },
  frame: {
    position: 'absolute',
    top: '20%',
    left: '15%',
    right: '15%',
    aspectRatio: 1,
    borderWidth: 3,
    borderColor: colors.accent,
    borderRadius: radius.xl,
  },
  permission: { flex: 1, justifyContent: 'center', padding: space.xl, gap: space.lg },
  manual: {
    gap: space.md,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: space.lg,
  },
});
