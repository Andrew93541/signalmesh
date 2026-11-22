package expo.modules.signalmeshnearby

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Receiving side of an SOS: the alert on a phone that actually received someone's SOS.
 *
 * Runs in native code so it does not depend on the JavaScript thread being awake.
 * - One alert per incident ID, remembered across restarts (SharedPreferences), so
 *   duplicate relay deliveries and app refreshes never restart the siren.
 * - Siren = our own looping MediaPlayer on the ALARM stream, plus vibration, until the
 *   recipient acknowledges, a responder acknowledges/resolves, or SIREN_MAX_MS passes.
 * - Respects the user: no sound if app notifications or the SOS channel are off, and no
 *   sound or vibration while Do Not Disturb is on. Nothing here changes system settings.
 * - Acknowledgement is written synchronously (commit) before the siren stops, so a local
 *   acknowledgement is durable; JS later sends it on and marks it CONFIRMED.
 */
object SosAlerts {
  private const val TAG = "SosAlerts"
  const val CHANNEL = "trackmate_sos_alert_v1"
  const val SERVICE_CHANNEL = "trackmate_mesh_listening_v1"
  const val ACTION_ACK = "expo.modules.signalmeshnearby.ACK"
  const val EXTRA_ID = "message_id"
  private const val PREFS = "trackmate_sos_alerts"
  private const val SIREN_MAX_MS = 10 * 60 * 1000L
  private val ID_RE = Regex("^SM-[A-Za-z0-9-]{6,64}$")

  /** Set by the module to forward events to JS while it is alive. */
  @Volatile var listener: ((String, Bundle) -> Unit)? = null

  private var player: MediaPlayer? = null
  private var sirenFor: String? = null
  private val handler = Handler(Looper.getMainLooper())

  private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
  private fun now(): String = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }.format(Date())
  private fun notifId(id: String) = 0x5050 + (id.hashCode() and 0xFFFFF)

  // ---- settings -------------------------------------------------------------------

  fun alertsEnabled(ctx: Context) = prefs(ctx).getBoolean("alertsEnabled", true)
  fun volume(ctx: Context) = prefs(ctx).getFloat("volume", 0.9f)
  fun vibrate(ctx: Context) = prefs(ctx).getBoolean("vibrate", true)
  fun sound(ctx: Context) = prefs(ctx).getBoolean("sound", true)
  fun notify(ctx: Context) = prefs(ctx).getBoolean("notify", true)
  fun setPrefs(ctx: Context, enabled: Boolean, volume: Double, vibrate: Boolean, sound: Boolean, notify: Boolean) {
    prefs(ctx).edit().putBoolean("alertsEnabled", enabled).putFloat("volume", volume.toFloat().coerceIn(0.05f, 1f))
      .putBoolean("vibrate", vibrate).putBoolean("sound", sound).putBoolean("notify", notify).commit()
    player?.setVolume(volume(ctx), volume(ctx))
  }

  // ---- channels / status --------------------------------------------------------------

  fun ensureChannels(ctx: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = ctx.getSystemService(NotificationManager::class.java)
    if (nm.getNotificationChannel(CHANNEL) == null) {
      nm.createNotificationChannel(NotificationChannel(CHANNEL, "Nearby SOS alerts", NotificationManager.IMPORTANCE_HIGH).apply {
        description = "Someone near you sent an SOS through TrackMate. The siren plays from the app, at your alarm volume."
        setSound(null, null) // the siren is played by the app so it can stop on acknowledgement
        enableVibration(false)
        lockscreenVisibility = NotificationCompat.VISIBILITY_PRIVATE
      })
    }
    if (nm.getNotificationChannel(SERVICE_CHANNEL) == null) {
      nm.createNotificationChannel(NotificationChannel(SERVICE_CHANNEL, "Listening for nearby SOS", NotificationManager.IMPORTANCE_LOW).apply {
        description = "Shown while TrackMate keeps the nearby mesh running in the background."
        setShowBadge(false)
      })
    }
  }

  private fun channelEnabled(ctx: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true
    val ch = ctx.getSystemService(NotificationManager::class.java).getNotificationChannel(CHANNEL) ?: return true
    return ch.importance != NotificationManager.IMPORTANCE_NONE
  }

  private fun canFullScreen(ctx: Context): Boolean =
    if (Build.VERSION.SDK_INT >= 34) ctx.getSystemService(NotificationManager::class.java).canUseFullScreenIntent() else true

  private fun dndActive(ctx: Context): Boolean =
    ctx.getSystemService(NotificationManager::class.java).currentInterruptionFilter.let {
      it != NotificationManager.INTERRUPTION_FILTER_ALL && it != NotificationManager.INTERRUPTION_FILTER_UNKNOWN
    }

  fun status(ctx: Context): Map<String, Any> {
    ensureChannels(ctx)
    return mapOf(
      "notificationsEnabled" to NotificationManagerCompat.from(ctx).areNotificationsEnabled(),
      "channelEnabled" to channelEnabled(ctx),
      "canFullScreen" to canFullScreen(ctx),
      "dndActive" to dndActive(ctx),
      "alertsEnabled" to alertsEnabled(ctx),
      "volume" to volume(ctx).toDouble(),
      "vibrate" to vibrate(ctx),
      "sound" to sound(ctx),
      "notify" to notify(ctx),
      "sirenPlaying" to (player != null),
    )
  }

  // ---- incoming SOS -------------------------------------------------------------------

  /** Returns true when this is a new incident and an alert was raised. Duplicates return false. */
  @Synchronized
  fun handleIncoming(ctx: Context, msg: JSONObject, ownDeviceId: String?, source: String): Boolean {
    val id = msg.optString("message_id")
    if (!ID_RE.matches(id)) return false
    if (ownDeviceId != null && msg.optString("device_id") == ownDeviceId) return false // our own SOS coming back
    val p = prefs(ctx)
    if (p.contains("alert:$id")) return false // already alerted (or acknowledged) for this incident

    val alert = JSONObject()
    for (k in listOf("message_id", "device_id", "worker_name", "category", "priority", "description", "created_at",
                     "location_recorded_at", "location_source", "sender_phone", "user_id")) {
      if (msg.has(k) && !msg.isNull(k)) alert.put(k, msg.get(k))
    }
    for (k in listOf("latitude", "longitude", "location_accuracy_m")) if (msg.has(k) && !msg.isNull(k)) alert.put(k, msg.optDouble(k))
    if (msg.has("location_is_last_known") && !msg.isNull("location_is_last_known")) alert.put("location_is_last_known", msg.optBoolean("location_is_last_known"))
    alert.put("hops", msg.optJSONArray("hops") ?: JSONArray())
    alert.put("received_at", now())
    alert.put("source", source)
    val enabled = alertsEnabled(ctx)
    alert.put("state", if (enabled) "ALERTING" else "MUTED")
    p.edit().putString("alert:$id", alert.toString()).commit()
    Log.i(TAG, "new SOS $id from ${alert.optString("device_id")} via $source (alerts ${if (enabled) "on" else "off"})")
    if (!enabled) return false

    ensureChannels(ctx)
    val canNotify = NotificationManagerCompat.from(ctx).areNotificationsEnabled() && channelEnabled(ctx)
    if (canNotify) {
      if (notify(ctx)) post(ctx, alert)
      when {
        dndActive(ctx) -> Log.i(TAG, "Do Not Disturb is on: no siren or vibration")
        sound(ctx) -> startSiren(ctx, id)
        vibrate(ctx) -> startVibration(ctx)
      }
    } else {
      Log.w(TAG, "notifications are off for TrackMate: no notification or siren; in-app pop-up only")
    }
    listener?.invoke("onAlert", Bundle().apply { putString("messageId", id); putBoolean("notified", canNotify) })
    return true
  }

  private fun openAppIntent(ctx: Context, id: String): PendingIntent {
    val i = Intent(Intent.ACTION_VIEW, Uri.parse("trackmate://sos-alert/$id")).apply {
      setPackage(ctx.packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      putExtra("trackmate_sos_alert", id)
    }
    return PendingIntent.getActivity(ctx, notifId(id), i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  private fun builder(ctx: Context, a: JSONObject): NotificationCompat.Builder {
    val id = a.getString("message_id")
    val category = a.optString("category", "GENERAL").lowercase().replaceFirstChar { it.uppercase() }.let { if (it == "General") "Emergency" else it }
    val public = NotificationCompat.Builder(ctx, CHANNEL)
      .setSmallIcon(android.R.drawable.ic_dialog_alert)
      .setContentTitle("Emergency SOS nearby")
      .setContentText("Unlock to see who needs help")
      .setColor(0xFFD92D36.toInt())
      .build()
    return NotificationCompat.Builder(ctx, CHANNEL)
      .setSmallIcon(android.R.drawable.ic_dialog_alert)
      .setColor(0xFFD92D36.toInt())
      .setContentTitle("SOS · $category emergency nearby")
      .setCategory(NotificationCompat.CATEGORY_ALARM)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
      .setPublicVersion(public)
      .setContentIntent(openAppIntent(ctx, id))
      .setOnlyAlertOnce(true)
  }

  private fun locationAction(ctx: Context, a: JSONObject, b: NotificationCompat.Builder) {
    if (a.has("latitude") && a.has("longitude")) {
      val lat = a.getDouble("latitude"); val lon = a.getDouble("longitude")
      val geo = Intent(Intent.ACTION_VIEW, Uri.parse("geo:$lat,$lon?q=$lat,$lon(SOS)")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      b.addAction(0, "View location", PendingIntent.getActivity(ctx, notifId(a.getString("message_id")) + 1, geo, PendingIntent.FLAG_IMMUTABLE))
    }
  }

  private fun post(ctx: Context, a: JSONObject) {
    val id = a.getString("message_id")
    val name = a.optString("worker_name", "Someone")
    val b = builder(ctx, a)
      .setContentText("$name needs help. Tap to respond.")
      .setOngoing(true)
      .setAutoCancel(false)
    if (canFullScreen(ctx)) b.setFullScreenIntent(openAppIntent(ctx, id), true)
    val ack = Intent(ctx, AckReceiver::class.java).setAction(ACTION_ACK).putExtra(EXTRA_ID, id)
    b.addAction(0, "Acknowledge SOS", PendingIntent.getBroadcast(ctx, notifId(id) + 2, ack, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
    locationAction(ctx, a, b)
    a.optString("sender_phone").takeIf { it.isNotBlank() }?.let { phone ->
      val dial = Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phone")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      b.addAction(0, "Call sender", PendingIntent.getActivity(ctx, notifId(id) + 3, dial, PendingIntent.FLAG_IMMUTABLE))
    }
    try {
      NotificationManagerCompat.from(ctx).notify(notifId(id), b.build())
    } catch (e: SecurityException) {
      Log.w(TAG, "notification not allowed", e)
    }
  }

  /** Replaces the alert notification with a quiet, dismissible one. */
  private fun settle(ctx: Context, a: JSONObject, text: String) {
    val b = builder(ctx, a).setContentText(text).setOngoing(false).setAutoCancel(true)
    locationAction(ctx, a, b)
    try { NotificationManagerCompat.from(ctx).notify(notifId(a.getString("message_id")), b.build()) } catch (_: SecurityException) {}
  }

  // ---- siren --------------------------------------------------------------------------

  private fun vibrator(ctx: Context): Vibrator =
    if (Build.VERSION.SDK_INT >= 31) ctx.getSystemService(VibratorManager::class.java).defaultVibrator
    else @Suppress("DEPRECATION") ctx.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator

  @Synchronized
  fun startSiren(ctx: Context, id: String?, maxMs: Long = SIREN_MAX_MS) {
    stopSiren(ctx)
    try {
      player = MediaPlayer().apply {
        setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
        setDataSource(ctx, Uri.parse("android.resource://${ctx.packageName}/${R.raw.sos_siren}"))
        isLooping = true
        setVolume(volume(ctx), volume(ctx))
        prepare()
        start()
      }
      sirenFor = id
      if (vibrate(ctx)) {
        vibrator(ctx).vibrate(VibrationEffect.createWaveform(longArrayOf(0, 900, 500), 0),
          AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build())
      }
      handler.postDelayed({ stopSiren(ctx) }, maxMs)
    } catch (e: Exception) {
      Log.w(TAG, "siren failed", e)
      stopSiren(ctx)
    }
  }

  private fun startVibration(ctx: Context) {
    try {
      vibrator(ctx).vibrate(VibrationEffect.createWaveform(longArrayOf(0, 900, 500), 0), AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build())
      handler.postDelayed({ stopSiren(ctx) }, SIREN_MAX_MS)
    } catch (e: Exception) { Log.w(TAG, "vibration failed", e) }
  }

  @Synchronized
  fun stopSiren(ctx: Context) {
    handler.removeCallbacksAndMessages(null)
    try { player?.stop() } catch (_: Exception) {}
    player?.release()
    player = null
    sirenFor = null
    try { vibrator(ctx).cancel() } catch (_: Exception) {}
  }

  // ---- acknowledgement / resolution ---------------------------------------------------------

  fun getAlert(ctx: Context, id: String): JSONObject? = prefs(ctx).getString("alert:$id", null)?.let { JSONObject(it) }

  fun listAlerts(ctx: Context): List<JSONObject> =
    prefs(ctx).all.filterKeys { it.startsWith("alert:") }.values.mapNotNull { (it as? String)?.let(::JSONObject) }
      .sortedByDescending { it.optString("received_at") }

  private fun save(ctx: Context, a: JSONObject) {
    prefs(ctx).edit().putString("alert:${a.getString("message_id")}", a.toString()).commit()
  }

  /** Local acknowledgement: durable first (commit), then siren off and notification updated. */
  @Synchronized
  fun acknowledge(ctx: Context, id: String): JSONObject? {
    val a = getAlert(ctx, id) ?: return null
    if (a.optString("ack_state").isEmpty()) {
      a.put("ack_state", "LOCAL").put("acknowledged_at", now())
      save(ctx, a)
    }
    if (a.optString("state") == "ALERTING" || a.optString("state") == "MUTED") a.put("state", "ACKNOWLEDGED")
    save(ctx, a)
    stopSiren(ctx)
    settle(ctx, a, "You acknowledged this SOS. Sending to the safety network…")
    listener?.invoke("onAck", Bundle().apply { putString("messageId", id); putString("ackState", a.optString("ack_state")) })
    return a
  }

  fun markAckConfirmed(ctx: Context, id: String, via: String): JSONObject? {
    val a = getAlert(ctx, id) ?: return null
    if (a.optString("ack_state") != "LOCAL") return a
    a.put("ack_state", "CONFIRMED").put("ack_confirmed_via", via).put("ack_confirmed_at", now())
    save(ctx, a)
    if (a.optString("state") == "ACKNOWLEDGED") settle(ctx, a, "Your acknowledgement reached the safety network (${via.lowercase()}).")
    return a
  }

  /** A responder acknowledged or resolved the incident: stop alerting this phone. */
  fun resolve(ctx: Context, id: String, status: String): JSONObject? {
    val a = getAlert(ctx, id) ?: return null
    if (a.optString("responder_status") == status) return a
    a.put("responder_status", status)
    val wasAlerting = a.optString("state") == "ALERTING"
    if (wasAlerting) a.put("state", "RESPONDED")
    save(ctx, a)
    if (wasAlerting) {
      if (sirenFor == id || sirenFor == null) stopSiren(ctx)
      settle(ctx, a, if (status == "RESOLVED") "This SOS has been resolved." else "A responder has acknowledged this SOS.")
    }
    return a
  }

  fun pendingAcks(ctx: Context): List<JSONObject> = listAlerts(ctx).filter { it.optString("ack_state") == "LOCAL" }
}
