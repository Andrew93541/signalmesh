package expo.modules.signalmeshnearby

import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

/**
 * Foreground service (type connectedDevice) that keeps the app process, and with it the
 * Nearby Connections link to nearby phones, alive while the screen is off or the app is in
 * the background. It does no work itself; it exists so Android does not freeze the mesh.
 * Started only while the user has the nearby mesh switched on, and it shows a persistent
 * low-importance notification as Android requires.
 */
class MeshService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    SosAlerts.ensureChannels(this)
    val open = packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(this, 1, it, PendingIntent.FLAG_IMMUTABLE)
    }
    val n = NotificationCompat.Builder(this, SosAlerts.SERVICE_CHANNEL)
      .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
      .setContentTitle("Listening for nearby SOS")
      .setContentText("TrackMate passes on and alerts you to SOS from nearby phones. Turn off in Help others.")
      .setOngoing(true)
      .setContentIntent(open)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .build()
    try {
      ServiceCompat.startForeground(this, NOTIFICATION_ID, n,
        if (Build.VERSION.SDK_INT >= 29) ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE else 0)
    } catch (e: Exception) {
      // Android refused (e.g. started from the background, or a permission was revoked).
      Log.w("MeshService", "could not start foreground service", e)
      stopSelf()
    }
    // Not sticky: if Android kills the process, the mesh needs the app to restart it anyway.
    return START_NOT_STICKY
  }

  companion object { const val NOTIFICATION_ID = 0x4D45 }
}
