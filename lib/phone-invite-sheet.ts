import { Alert, Linking, Share } from 'react-native';

export function showPhoneInviteSheet(params: {
  rawPhone: string;
  privateLabel: string;
  fullMessage: string;
  /**
   * Called when the user opens a delivery channel (Messages, WhatsApp, or Share).
   * This does not confirm the invite was sent or received — only that the user
   * actively chose to open a channel. Not called on Cancel or WhatsApp-unavailable fallback.
   */
  onDeliveryChannelOpened: () => void;
  /** Called after every button including Cancel. Use for post-sheet navigation. */
  onDismiss: () => void;
}): void {
  const { rawPhone, privateLabel, fullMessage, onDeliveryChannelOpened, onDismiss } = params;
  const smsPhone = rawPhone.replace(/\s/g, '');
  const waPhone = rawPhone.replace(/\D/g, '');
  const encodedMsg = encodeURIComponent(fullMessage);

  // B53: AWAIT the native action (share sheet / openURL) before onDismiss().
  // onDismiss triggers router.replace in the evaluate caller; running it while the
  // UIActivityViewController / app-switch is mid-transition made react-native-screens
  // snapshot during a mount → main-thread stall on the render server → SIGABRT
  // (DIAG-B52). Navigation is only DEFERRED, never lost — onDismiss always runs,
  // including on cancel and on failure.
  Alert.alert(
    'Send Bao invite',
    `Choose how to send it to ${privateLabel}.`,
    [
      {
        text: 'Messages',
        onPress: async () => {
          try {
            await Linking.openURL(`sms:${smsPhone}?body=${encodedMsg}`);
          } catch {
            Alert.alert('Messages not available', 'Could not open Messages.');
          }
          onDeliveryChannelOpened();
          onDismiss();
        },
      },
      {
        text: 'WhatsApp',
        onPress: async () => {
          const waUrl = `whatsapp://send?phone=${waPhone}&text=${encodedMsg}`;
          try {
            if (await Linking.canOpenURL(waUrl)) {
              onDeliveryChannelOpened();
              await Linking.openURL(waUrl);
            } else {
              Alert.alert('WhatsApp not available', "WhatsApp isn't available. Try Messages.");
            }
          } catch {
            Alert.alert('WhatsApp not available', "WhatsApp isn't available. Try Messages.");
          }
          onDismiss();
        },
      },
      {
        text: 'More options',
        onPress: async () => {
          try {
            await Share.share({ message: fullMessage });
          } catch {
            // Share failed/cancelled at the native layer — must not block navigation.
          }
          onDeliveryChannelOpened();
          onDismiss();
        },
      },
      { text: 'Cancel', style: 'cancel', onPress: onDismiss },
    ],
  );
}
