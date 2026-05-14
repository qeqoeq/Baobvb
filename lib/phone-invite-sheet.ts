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

  Alert.alert(
    'Send Bao invite',
    `Choose how to send it to ${privateLabel}.`,
    [
      {
        text: 'Messages',
        onPress: () => {
          Linking.openURL(`sms:${smsPhone}?body=${encodedMsg}`).catch(() => {
            Alert.alert('Messages not available', 'Could not open Messages.');
          });
          onDeliveryChannelOpened();
          onDismiss();
        },
      },
      {
        text: 'WhatsApp',
        onPress: () => {
          const waUrl = `whatsapp://send?phone=${waPhone}&text=${encodedMsg}`;
          Linking.canOpenURL(waUrl)
            .then((canOpen) => {
              if (canOpen) {
                onDeliveryChannelOpened();
                return Linking.openURL(waUrl);
              }
              Alert.alert('WhatsApp not available', "WhatsApp isn't available. Try Messages.");
            })
            .catch(() => {
              Alert.alert('WhatsApp not available', "WhatsApp isn't available. Try Messages.");
            });
          onDismiss();
        },
      },
      {
        text: 'More options',
        onPress: () => {
          void Share.share({ message: fullMessage });
          onDeliveryChannelOpened();
          onDismiss();
        },
      },
      { text: 'Cancel', style: 'cancel', onPress: onDismiss },
    ],
  );
}
