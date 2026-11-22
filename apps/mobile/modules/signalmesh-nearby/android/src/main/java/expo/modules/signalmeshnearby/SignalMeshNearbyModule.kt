package expo.modules.signalmeshnearby

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import androidx.core.content.ContextCompat
import org.json.JSONObject
import android.util.Log
import com.google.android.gms.common.api.ApiException
import com.google.android.gms.nearby.Nearby
import com.google.android.gms.nearby.connection.AdvertisingOptions
import com.google.android.gms.nearby.connection.ConnectionInfo
import com.google.android.gms.nearby.connection.ConnectionLifecycleCallback
import com.google.android.gms.nearby.connection.ConnectionResolution
import com.google.android.gms.nearby.connection.ConnectionsClient
import com.google.android.gms.nearby.connection.ConnectionsStatusCodes
import com.google.android.gms.nearby.connection.DiscoveredEndpointInfo
import com.google.android.gms.nearby.connection.DiscoveryOptions
import com.google.android.gms.nearby.connection.EndpointDiscoveryCallback
import com.google.android.gms.nearby.connection.Payload
import com.google.android.gms.nearby.connection.PayloadCallback
import com.google.android.gms.nearby.connection.PayloadTransferUpdate
import com.google.android.gms.nearby.connection.Strategy
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.ConcurrentHashMap

/**
 * Thin wrapper over Google Nearby Connections (P2P_CLUSTER: many-to-many mesh).
 * Every phone advertises and discovers at once. To avoid two phones requesting
 * each other at the same moment, only the one whose name sorts lower asks.
 * Connections are accepted automatically: payloads are validated in JS.
 */
class SignalMeshNearbyModule : Module() {
  private val serviceId = "com.trackmate.signalmesh.v1"
  private val strategy = Strategy.P2P_CLUSTER
  private val tag = "SignalMeshNearby"

  private val context get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()
  private val client: ConnectionsClient by lazy { Nearby.getConnectionsClient(context) }

  private var localName = ""
  @Volatile private var running = false
  private val peers = ConcurrentHashMap<String, String>() // endpointId -> endpoint name
  private val pendingNames = ConcurrentHashMap<String, String>()
  private val requesting = ConcurrentHashMap.newKeySet<String>()

  private fun emit(event: String, vararg pairs: Pair<String, Any?>) {
    val b = Bundle()
    for ((k, v) in pairs) when (v) {
      is String -> b.putString(k, v)
      is Int -> b.putInt(k, v)
      is Boolean -> b.putBoolean(k, v)
      null -> b.putString(k, null)
      else -> b.putString(k, v.toString())
    }
    try { sendEvent(event, b) } catch (e: Exception) { Log.w(tag, "emit failed", e) }
  }

  private fun statusText(e: Exception): String =
    if (e is ApiException) "${ConnectionsStatusCodes.getStatusCodeString(e.statusCode)} (${e.statusCode})" else (e.message ?: e.toString())

  private val payloadCallback = object : PayloadCallback() {
    override fun onPayloadReceived(endpointId: String, payload: Payload) {
      val bytes = payload.asBytes() ?: return
      val data = String(bytes, Charsets.UTF_8)
      // Raise the recipient alert here, in native code, so it works even if JS is paused.
      try {
        val f = JSONObject(data)
        if (f.optInt("v") == 1 && f.optString("t") == "SOS") {
          f.optJSONObject("msg")?.let { SosAlerts.handleIncoming(context.applicationContext, it, localName.removePrefix("TM:"), "mesh:${peers[endpointId] ?: endpointId}") }
        }
      } catch (e: Exception) { Log.w(tag, "alert check failed", e) }
      emit("onMessage", "endpointId" to endpointId, "name" to peers[endpointId], "data" to data)
    }
    override fun onPayloadTransferUpdate(endpointId: String, update: PayloadTransferUpdate) {}
  }

  private val lifecycle = object : ConnectionLifecycleCallback() {
    override fun onConnectionInitiated(endpointId: String, info: ConnectionInfo) {
      pendingNames[endpointId] = info.endpointName
      client.acceptConnection(endpointId, payloadCallback)
        .addOnFailureListener { emit("onLog", "message" to "accept ${info.endpointName} failed: ${statusText(it)}") }
    }
    override fun onConnectionResult(endpointId: String, result: ConnectionResolution) {
      requesting.remove(endpointId)
      val name = pendingNames.remove(endpointId) ?: endpointId
      if (result.status.isSuccess) {
        peers[endpointId] = name
        emit("onPeer", "type" to "connected", "endpointId" to endpointId, "name" to name)
      } else {
        emit("onLog", "message" to "connection to $name failed: ${ConnectionsStatusCodes.getStatusCodeString(result.status.statusCode)}")
      }
    }
    override fun onDisconnected(endpointId: String) {
      val name = peers.remove(endpointId)
      emit("onPeer", "type" to "disconnected", "endpointId" to endpointId, "name" to name)
    }
  }

  private val discovery = object : EndpointDiscoveryCallback() {
    override fun onEndpointFound(endpointId: String, info: DiscoveredEndpointInfo) {
      emit("onLog", "message" to "found ${info.endpointName}")
      if (localName == info.endpointName) { emit("onLog", "message" to "another phone uses the same device ID ($localName); change one in Connection settings"); return }
      if (!running || peers.containsKey(endpointId) || !requesting.add(endpointId)) return
      if (localName >= info.endpointName) { requesting.remove(endpointId); return } // the other phone asks
      client.requestConnection(localName, endpointId, lifecycle).addOnFailureListener {
        requesting.remove(endpointId)
        emit("onLog", "message" to "request to ${info.endpointName} failed: ${statusText(it)}")
      }
    }
    override fun onEndpointLost(endpointId: String) {
      emit("onLog", "message" to "lost $endpointId")
    }
  }

  private fun bundleOf(m: Map<String, Any>) = Bundle().apply {
    for ((k, v) in m) when (v) { is Boolean -> putBoolean(k, v); is Double -> putDouble(k, v); is String -> putString(k, v) }
  }

  /** Show the alert screen over the lock screen only when opened from an SOS alert. */
  private fun applyLockScreen(intent: Intent?) {
    val id = intent?.getStringExtra("trackmate_sos_alert") ?: return
    val act = appContext.currentActivity ?: return
    act.runOnUiThread {
      if (Build.VERSION.SDK_INT >= 27) { act.setShowWhenLocked(true); act.setTurnScreenOn(true) }
    }
    launchAlert = id
  }
  @Volatile private var launchAlert: String? = null

  override fun definition() = ModuleDefinition {
    Name("SignalMeshNearby")
    Events("onPeer", "onMessage", "onLog", "onAlert", "onAck")

    OnCreate {
      SosAlerts.listener = { event, bundle -> try { sendEvent(event, bundle) } catch (_: Exception) {} }
    }
    OnNewIntent { intent -> applyLockScreen(intent) }
    OnActivityEntersForeground { applyLockScreen(appContext.currentActivity?.intent) }

    // ---- recipient alerts ----
    Function("alertStatus") { SosAlerts.status(context) }
    Function("setAlertPrefs") { enabled: Boolean, volume: Double, vibrate: Boolean, sound: Boolean, notify: Boolean ->
      SosAlerts.setPrefs(context, enabled, volume, vibrate, sound, notify); true
    }
    /** For SOS received over the Wi-Fi relay (JS side); the mesh path is handled natively above. */
    Function("handleIncomingSos") { json: String, source: String ->
      SosAlerts.handleIncoming(context.applicationContext, JSONObject(json), localName.removePrefix("TM:").ifEmpty { null }, source)
    }
    Function("getAlert") { id: String -> SosAlerts.getAlert(context, id)?.toString() }
    Function("listAlerts") { SosAlerts.listAlerts(context).map { it.toString() } }
    Function("acknowledge") { id: String -> SosAlerts.acknowledge(context.applicationContext, id)?.toString() }
    Function("markAckConfirmed") { id: String, via: String -> SosAlerts.markAckConfirmed(context.applicationContext, id, via)?.toString() }
    Function("pendingAcks") { SosAlerts.pendingAcks(context).map { it.toString() } }
    Function("resolveAlert") { id: String, status: String -> SosAlerts.resolve(context.applicationContext, id, status)?.toString() }
    Function("testSiren") { SosAlerts.startSiren(context.applicationContext, null, 3000L); true }
    Function("stopSiren") { SosAlerts.stopSiren(context.applicationContext); true }
    Function("consumeLaunchAlert") {
      applyLockScreen(appContext.currentActivity?.intent)
      val id = launchAlert; launchAlert = null; id
    }
    Function("releaseLockScreen") {
      appContext.currentActivity?.let { act ->
        act.runOnUiThread { if (Build.VERSION.SDK_INT >= 27) { act.setShowWhenLocked(false); act.setTurnScreenOn(false) } }
        act.intent?.removeExtra("trackmate_sos_alert")
      }
      true
    }
    Function("openNotificationSettings") {
      val i = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(i); true
    }
    Function("openFullScreenSettings") {
      val i = if (Build.VERSION.SDK_INT >= 34) Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:${context.packageName}"))
              else Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
      context.startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); true
    }

    // ---- background listening (foreground service) ----
    Function("startService") {
      try { ContextCompat.startForegroundService(context, Intent(context, MeshService::class.java)); true }
      catch (e: Exception) { Log.w(tag, "foreground service refused", e); false }
    }
    Function("stopService") { context.stopService(Intent(context, MeshService::class.java)); true }

    AsyncFunction("start") { name: String, promise: Promise ->
      localName = name
      running = true
      val ignoreAlready = { e: Exception -> e is ApiException && (e.statusCode == ConnectionsStatusCodes.STATUS_ALREADY_ADVERTISING || e.statusCode == ConnectionsStatusCodes.STATUS_ALREADY_DISCOVERING) }
      client.startAdvertising(name, serviceId, lifecycle, AdvertisingOptions.Builder().setStrategy(strategy).build())
        .continueWithTask { adv ->
          if (!adv.isSuccessful && !ignoreAlready(adv.exception!!)) throw adv.exception!!
          client.startDiscovery(serviceId, discovery, DiscoveryOptions.Builder().setStrategy(strategy).build())
        }
        .addOnSuccessListener { promise.resolve(true) }
        .addOnFailureListener { e ->
          if (ignoreAlready(e)) promise.resolve(true)
          else { running = false; promise.reject("ERR_NEARBY_START", statusText(e), e) }
        }
    }

    AsyncFunction("stop") {
      running = false
      client.stopAdvertising()
      client.stopDiscovery()
      client.stopAllEndpoints()
      peers.clear(); pendingNames.clear(); requesting.clear()
      true
    }

    AsyncFunction("send") { endpointId: String, data: String, promise: Promise ->
      val bytes = data.toByteArray(Charsets.UTF_8)
      if (bytes.size > ConnectionsClient.MAX_BYTES_DATA_SIZE) {
        promise.reject("ERR_NEARBY_SIZE", "Message too large", null); return@AsyncFunction
      }
      client.sendPayload(endpointId, Payload.fromBytes(bytes))
        .addOnSuccessListener { promise.resolve(true) }
        .addOnFailureListener { promise.reject("ERR_NEARBY_SEND", statusText(it), it) }
    }

    Function("peers") {
      peers.map { (id, name) -> mapOf("endpointId" to id, "name" to name) }
    }

    OnDestroy {
      try { if (running) { client.stopAllEndpoints(); client.stopAdvertising(); client.stopDiscovery() } } catch (_: Exception) {}
    }
  }
}
