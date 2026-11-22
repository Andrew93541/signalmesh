package expo.modules.signalmeshnearby

import android.content.Intent
import android.util.Log
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord
import androidx.health.connect.client.request.AggregateGroupByPeriodRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.Period

/**
 * Reads activity data from Android Health Connect. Read-only, only the record types the
 * Analytics screen shows, and only those the user granted. Nothing is written, and nothing
 * here is sent to the TrackMate server.
 */
class HealthModule : Module() {
  private val context get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()
  private val REQ = 0x4C30
  private var pending: Promise? = null

  private val wanted = mapOf(
    "STEPS" to HealthPermission.getReadPermission(StepsRecord::class),
    "DISTANCE" to HealthPermission.getReadPermission(DistanceRecord::class),
    "ACTIVE_CALORIES" to HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class),
    "TOTAL_CALORIES" to HealthPermission.getReadPermission(TotalCaloriesBurnedRecord::class),
    "EXERCISE" to HealthPermission.getReadPermission(ExerciseSessionRecord::class),
  )

  private fun sdk(): String = when (HealthConnectClient.getSdkStatus(context)) {
    HealthConnectClient.SDK_AVAILABLE -> "AVAILABLE"
    HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "UPDATE_REQUIRED"
    else -> "UNAVAILABLE"
  }

  private suspend fun granted(): List<String> {
    if (sdk() != "AVAILABLE") return emptyList()
    val g = HealthConnectClient.getOrCreate(context).permissionController.getGrantedPermissions()
    return wanted.filterValues { it in g }.keys.toList()
  }

  override fun definition() = ModuleDefinition {
    Name("TrackMateHealth")

    AsyncFunction("status") Coroutine { ->
      mapOf("sdk" to sdk(), "granted" to granted())
    }

    // Must run on the main thread with the visible activity, or Android shows nothing.
    AsyncFunction("requestPermissions") { promise: Promise ->
      try {
        val status = sdk()
        if (status != "AVAILABLE") { promise.reject("ERR_HC_UNAVAILABLE", "Health Connect is not available on this phone ($status).", null); return@AsyncFunction }
        val act = appContext.throwingActivity
        pending?.resolve(emptyList<String>())
        pending = promise
        val intent = PermissionController.createRequestPermissionResultContract().createIntent(act, wanted.values.toSet())
        Log.i("TrackMateHealth", "requesting Health Connect permissions via ${intent.action}")
        act.startActivityForResult(intent, REQ)
      } catch (e: Exception) {
        Log.w("TrackMateHealth", "permission request failed", e)
        pending = null
        promise.reject("ERR_HC_REQUEST", e.message ?: e.toString(), e)
      }
    }.runOnQueue(Queues.MAIN)

    /** Fallback: TrackMate's own page in Health Connect, where the user can switch permissions on. */
    Function("openAppPermissions") {
      val pkg = context.packageName
      val tries = listOf(
        Intent("android.health.connect.action.MANAGE_HEALTH_PERMISSIONS").putExtra(Intent.EXTRA_PACKAGE_NAME, pkg),
        Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS),
      )
      for (i in tries) {
        try { context.startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); return@Function true } catch (_: Exception) {}
      }
      false
    }

    OnActivityResult { _, payload ->
      if (payload.requestCode != REQ) return@OnActivityResult
      Log.i("TrackMateHealth", "permission screen closed (result ${payload.resultCode})")
      val p = pending ?: return@OnActivityResult
      pending = null
      appContext.backgroundCoroutineScope.launch {
        try { p.resolve(granted()) } catch (e: Exception) { p.reject("ERR_HEALTH", e.message, e) }
      }
    }

    /** One row per local day from `start` (YYYY-MM-DD). null = no permission or no data source; 0 = data source reported zero. */
    AsyncFunction("daily") Coroutine { start: String, days: Int ->
      val have = granted().toSet()
      if (have.isEmpty()) return@Coroutine emptyList<Map<String, Any?>>()
      val from = LocalDate.parse(start).atStartOfDay()
      val to = from.plusDays(days.coerceIn(1, 31).toLong())
      val metrics = buildSet {
        if ("STEPS" in have) add(StepsRecord.COUNT_TOTAL)
        if ("DISTANCE" in have) add(DistanceRecord.DISTANCE_TOTAL)
        if ("ACTIVE_CALORIES" in have) add(ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL)
        if ("TOTAL_CALORIES" in have) add(TotalCaloriesBurnedRecord.ENERGY_TOTAL)
        if ("EXERCISE" in have) add(ExerciseSessionRecord.EXERCISE_DURATION_TOTAL)
      }
      val rows = HealthConnectClient.getOrCreate(context).aggregateGroupByPeriod(
        AggregateGroupByPeriodRequest(metrics, TimeRangeFilter.between(from, to), Period.ofDays(1)))
      rows.map { r ->
        val res = r.result
        mapOf(
          "date" to r.startTime.toLocalDate().toString(),
          "steps" to res[StepsRecord.COUNT_TOTAL]?.toDouble(),
          "distance_m" to res[DistanceRecord.DISTANCE_TOTAL]?.inMeters,
          "active_kcal" to res[ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL]?.inKilocalories,
          "total_kcal" to res[TotalCaloriesBurnedRecord.ENERGY_TOTAL]?.inKilocalories,
          "exercise_min" to res[ExerciseSessionRecord.EXERCISE_DURATION_TOTAL]?.toMinutes()?.toDouble(),
          "sources" to res.dataOrigins.map { it.packageName },
        )
      }
    }

    AsyncFunction("sessions") Coroutine { days: Int ->
      if ("EXERCISE" !in granted()) return@Coroutine emptyList<Map<String, Any?>>()
      val end = Instant.now()
      val r = HealthConnectClient.getOrCreate(context).readRecords(
        ReadRecordsRequest(ExerciseSessionRecord::class, TimeRangeFilter.between(end.minusSeconds(days.coerceIn(1, 31) * 86400L), end), pageSize = 50))
      r.records.sortedByDescending { it.startTime }.map {
        mapOf("title" to it.title, "type" to it.exerciseType, "start" to it.startTime.toString(), "end" to it.endTime.toString(),
              "source" to it.metadata.dataOrigin.packageName)
      }
    }

    Function("openSettings") {
      val i = Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      try { context.startActivity(i); true } catch (_: Exception) { false }
    }
  }
}
