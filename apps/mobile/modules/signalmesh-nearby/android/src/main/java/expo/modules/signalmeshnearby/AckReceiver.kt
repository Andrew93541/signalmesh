package expo.modules.signalmeshnearby

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** "Acknowledge SOS" button on the notification. Works even when the app UI is closed. */
class AckReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != SosAlerts.ACTION_ACK) return
    val id = intent.getStringExtra(SosAlerts.EXTRA_ID) ?: return
    SosAlerts.acknowledge(context.applicationContext, id)
  }
}
