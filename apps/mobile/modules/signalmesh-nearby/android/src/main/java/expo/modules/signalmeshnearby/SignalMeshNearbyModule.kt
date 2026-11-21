package expo.modules.signalmeshnearby

import android.os.Bundle
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
      emit("onMessage", "endpointId" to endpointId, "name" to peers[endpointId], "data" to String(bytes, Charsets.UTF_8))
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

  override fun definition() = ModuleDefinition {
    Name("SignalMeshNearby")
    Events("onPeer", "onMessage", "onLog")

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
