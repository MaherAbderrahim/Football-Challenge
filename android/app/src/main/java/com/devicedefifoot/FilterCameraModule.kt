package com.devicedefifoot

import android.Manifest
import android.app.Activity
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.MediaRecorder
import android.media.MediaScannerConnection
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.util.DisplayMetrics
import android.util.Log
import android.view.WindowManager
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.util.concurrent.Executors

/**
 * Records the app screen (camera preview + filter overlay) to an MP4 file using MediaProjection.
 *
 * - Captures the full screen (so the React Native filter overlay is included in the video).
 * - Records audio from the microphone (so the final video contains sound).
 * - Expects the JS side to ask for RECORD_AUDIO runtime permission before calling startRecording.
 * - Flow:
 *     startRecording(path) -> verify MIC permission -> startActivityForResult(MEDIA_PROJECTION intent)
 *     onActivityResult handles MEDIA_PROJECTION result -> startInternal(resultCode, data, path).
 * - stopRecording stops everything robustly and resolves with the output path (or null if empty).
 */
class FilterCameraModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ActivityEventListener, LifecycleEventListener {

    private var mediaProjection: MediaProjection? = null
    private var mediaRecorder: MediaRecorder? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var recordingStarted = false
    private var pendingPromise: Promise? = null
    private var pendingOutputPath: String? = null
    private val handler = Handler(Looper.getMainLooper())
    private val recordingExecutor = Executors.newSingleThreadExecutor()

    init {
        reactContext.addActivityEventListener(this)
        reactContext.addLifecycleEventListener(this)
    }

    override fun getName(): String = "FilterCameraModule"

    @ReactMethod
    fun startRecording(outputFile: String, promise: Promise) {
        val activity = currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "Aucune activite active")
            return
        }
        if (mediaRecorder != null) {
            promise.reject("ALREADY_RECORDING", "Enregistrement deja en cours")
            return
        }

        if (!hasMicPermission()) {
            promise.reject(
                "MIC_PERMISSION_DENIED",
                "L'autorisation du microphone manque. Demandez-la cote JS avant l'enregistrement."
            )
            return
        }

        pendingOutputPath = stripFileUri(outputFile)
        pendingPromise = promise
        requestMediaProjection()
    }

    @ReactMethod
    fun stopRecording(promise: Promise) {
        try {
            stopInternal()
            val path = pendingOutputPath
            if (path.isNullOrEmpty()) {
                promise.resolve(null)
                return
            }
            val file = File(path)
            if (!file.exists() || file.length() == 0L) {
                // Recording too short or empty — return null so the JS side can react.
                promise.resolve(null)
                return
            }
            promise.resolve(path)
        } catch (e: Exception) {
            Log.e(TAG, "stopRecording error", e)
            promise.reject("STOP_ERROR", e.message ?: e.toString())
        } finally {
            pendingOutputPath = null
        }
    }

    /**
     * Moves a recorded file to a final destination using native Java IO.
     * This avoids Expo FileSystem's moveAsync which can fail with "isn't movable"
     * when the file was just released by MediaRecorder.
     *
     * Tries an atomic rename first, then falls back to a copy + delete.
     * Resolves with the destination path, or rejects MOVE_ERROR.
     */
    @ReactMethod
    fun moveRecordedFile(srcPath: String, destPath: String, promise: Promise) {
        try {
            val src = File(stripFileUri(srcPath))
            val dest = File(stripFileUri(destPath))
            if (!src.exists()) {
                promise.reject("MOVE_ERROR", "Le fichier source n'existe pas: $srcPath")
                return
            }
            dest.parentFile?.mkdirs()
            if (dest.exists()) dest.delete()

            var ok = false
            // Try atomic rename first (fast, works within the same filesystem).
            try {
                ok = src.renameTo(dest)
            } catch (e: Exception) {
                Log.w(TAG, "renameTo failed: ${e.message}")
            }
            // Fallback: copy then delete the source.
            if (!ok) {
                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        Files.move(
                            src.toPath(),
                            dest.toPath(),
                            StandardCopyOption.REPLACE_EXISTING,
                            StandardCopyOption.ATOMIC_MOVE
                        )
                        ok = true
                    } else {
                        src.copyTo(dest, overwrite = true)
                        src.delete()
                        ok = true
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "Files.move fallback failed: ${e.message}")
                }
            }
            if (!ok) {
                promise.reject("MOVE_ERROR", "Impossible de deplacer le fichier vers $destPath")
                return
            }
            promise.resolve(destPath)
        } catch (e: Exception) {
            Log.e(TAG, "moveRecordedFile error", e)
            promise.reject("MOVE_ERROR", e.message ?: e.toString())
        }
    }

    /**
     * Copies a recorded video into the device gallery / media store.
     *
     * - Android 10+ (API 29+): inserts the file into MediaStore under
     *   "Movies/FootMimo" via ContentResolver (no storage permission needed).
     * - Older Android: copies into the public Movies directory, then fires a
     *   MediaScanner scan so the file shows up in the gallery immediately.
     *
     * Resolves with the gallery URI (content:// on API 29+, file:// on older
     * versions), or rejects GALLERY_ERROR.
     */
    @ReactMethod
    fun saveToGallery(srcPath: String, promise: Promise) {
        try {
            val src = File(stripFileUri(srcPath))
            if (!src.exists()) {
                promise.reject("GALLERY_ERROR", "Le fichier source n'existe pas: $srcPath")
                return
            }
            val resolver = reactApplicationContext.contentResolver

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val values = ContentValues().apply {
                    put(MediaStore.Video.Media.DISPLAY_NAME, src.name)
                    put(MediaStore.Video.Media.MIME_TYPE, "video/mp4")
                    put(MediaStore.Video.Media.RELATIVE_PATH, Environment.DIRECTORY_MOVIES + "/FootMimo")
                    put(MediaStore.Video.Media.IS_PENDING, 1)
                }
                val uri = resolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, values)
                    ?: throw IllegalStateException("Impossible de créer l'entrée MediaStore")
                val out = resolver.openOutputStream(uri)
                    ?: throw IllegalStateException("Impossible d'ouvrir le flux de sortie MediaStore")
                out.use { o ->
                    src.inputStream().use { i -> i.copyTo(o) }
                }
                values.clear()
                values.put(MediaStore.Video.Media.IS_PENDING, 0)
                resolver.update(uri, values, null, null)
                Log.i(TAG, "Film enregistré dans la galerie: $uri")
                promise.resolve(uri.toString())
            } else {
                if (
                    ContextCompat.checkSelfPermission(
                        reactApplicationContext,
                        Manifest.permission.WRITE_EXTERNAL_STORAGE
                    ) != PackageManager.PERMISSION_GRANTED
                ) {
                    throw IllegalStateException(
                        "Autorisation d'ecriture requise pour la galerie sur cet appareil"
                    )
                }
                @Suppress("DEPRECATION")
                val dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES)
                val folder = File(dir, "FootMimo")
                if (!folder.exists() && !folder.mkdirs()) {
                    throw IllegalStateException("Impossible de créer le dossier galerie")
                }
                val target = File(folder, src.name)
                src.copyTo(target, overwrite = true)
                MediaScannerConnection.scanFile(
                    reactApplicationContext,
                    arrayOf(target.absolutePath),
                    arrayOf("video/mp4"),
                    null
                )
                Log.i(TAG, "Film enregistré dans la galerie: $target")
                promise.resolve(target.absolutePath)
            }
        } catch (e: Exception) {
            Log.e(TAG, "saveToGallery error", e)
            promise.reject("GALLERY_ERROR", e.message ?: e.toString())
        }
    }

    @ReactMethod
    fun isRecording(promise: Promise) {
        promise.resolve(mediaRecorder != null)
    }

    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode != REQUEST_MEDIA_PROJECTION) return
        val promise = pendingPromise
        if (resultCode != Activity.RESULT_OK || data == null) {
            pendingPromise = null
            pendingOutputPath = null
            promise?.reject("PERMISSION_DENIED", "Autorisation de capture d'ecran refusee")
            return
        }
        val capturedData = data
        val outPath = pendingOutputPath ?: run {
            pendingPromise = null
            promise?.reject("NO_PATH", "Chemin de sortie manquant")
            return
        }
        recordingExecutor.execute {
            try {
                startInternal(resultCode, capturedData, outPath)
                promise?.resolve(true)
            } catch (e: Exception) {
                Log.e(TAG, "startInternal error", e)
                stopInternal()
                pendingPromise = null
                pendingOutputPath = null
                promise?.reject("START_ERROR", e.message ?: e.toString())
            }
        }
    }

    override fun onNewIntent(intent: Intent?) = Unit

    override fun onHostResume() = Unit
    override fun onHostPause() = Unit
    override fun onHostDestroy() {
        stopInternal()
    }

    private fun requestMediaProjection() {
        val activity = currentActivity ?: run {
            pendingPromise?.reject("NO_ACTIVITY", "Aucune activite active")
            pendingPromise = null
            pendingOutputPath = null
            return
        }
        try {
            val pm = reactApplicationContext.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
            activity.startActivityForResult(pm.createScreenCaptureIntent(), REQUEST_MEDIA_PROJECTION)
        } catch (e: Exception) {
            Log.e(TAG, "requestMediaProjection error", e)
            pendingPromise?.reject("NO_PROJECTION_SERVICE", e.message ?: e.toString())
            pendingPromise = null
            pendingOutputPath = null
        }
    }

    private fun startInternal(resultCode: Int, data: Intent, path: String) {
        File(path).parentFile?.mkdirs()

        val pm = reactApplicationContext.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        MediaProjectionForegroundService.resetLatch()
        MediaProjectionForegroundService.start(reactApplicationContext)
        if (!MediaProjectionForegroundService.awaitForeground(15000)) {
            MediaProjectionForegroundService.stop(reactApplicationContext)
            throw IllegalStateException("Le service de premier plan n'a pas demarre a temps")
        }

        mediaProjection = pm.getMediaProjection(resultCode, data)

        mediaProjection?.registerCallback(object : MediaProjection.Callback() {
            override fun onStop() {
                handler.post { stopInternal() }
            }
        }, handler)

        val metrics = getDisplaySize()
        val width = if (metrics.widthPixels % 2 == 0) metrics.widthPixels else metrics.widthPixels - 1
        val height = if (metrics.heightPixels % 2 == 0) metrics.heightPixels else metrics.heightPixels - 1
        val density = metrics.densityDpi

        val recorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            MediaRecorder(reactApplicationContext)
        } else {
            @Suppress("DEPRECATION")
            MediaRecorder()
        }

        // Audio source first (required before setting video source on some OEMs).
        recorder.setAudioSource(MediaRecorder.AudioSource.MIC)
        recorder.setVideoSource(MediaRecorder.VideoSource.SURFACE)
        recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
        recorder.setOutputFile(path)
        recorder.setVideoSize(width, height)
        recorder.setVideoFrameRate(30)
        recorder.setVideoEncoder(MediaRecorder.VideoEncoder.H264)
        recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
        recorder.setAudioEncodingBitRate(128_000)
        recorder.setAudioSamplingRate(44_100)
        recorder.setVideoEncodingBitRate(12_000_000)
        recorder.prepare()
        mediaRecorder = recorder

        val surface = recorder.surface
        virtualDisplay = mediaProjection?.createVirtualDisplay(
            "FilterCameraRecording",
            width, height, density,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            surface, null, handler
        )

        recorder.start()
        recordingStarted = true
    }

    private fun getDisplaySize(): DisplayMetrics {
        val metrics = DisplayMetrics()
        val wm = reactApplicationContext.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val bounds = wm.currentWindowMetrics.bounds
            metrics.widthPixels = bounds.width()
            metrics.heightPixels = bounds.height()
        } else {
            @Suppress("DEPRECATION")
            wm.defaultDisplay.getRealMetrics(metrics)
        }
        metrics.densityDpi = reactApplicationContext.resources.displayMetrics.densityDpi
        return metrics
    }

    private fun stopInternal() {
        try {
            if (recordingStarted) {
                try {
                    mediaRecorder?.stop()
                } catch (e: RuntimeException) {
                    // stop() throws if the recording is too short or already stopped.
                    // The file may still be valid when the exception is "stop failed".
                    Log.w(TAG, "MediaRecorder.stop() threw: ${e.message}")
                }
                recordingStarted = false
            }
        } catch (e: Exception) {
            Log.w(TAG, "stopInternal stop phase: ${e.message}")
        }
        try {
            mediaRecorder?.release()
        } catch (e: Exception) {
            Log.w(TAG, "mediaRecorder release: ${e.message}")
        }
        mediaRecorder = null
        try {
            virtualDisplay?.release()
        } catch (e: Exception) {
            Log.w(TAG, "virtualDisplay release: ${e.message}")
        }
        virtualDisplay = null
        try {
            mediaProjection?.stop()
        } catch (e: Exception) {
            Log.w(TAG, "mediaProjection stop: ${e.message}")
        }
        mediaProjection = null
        try {
            MediaProjectionForegroundService.stop(reactApplicationContext)
        } catch (e: Exception) {
            Log.w(TAG, "foreground service stop: ${e.message}")
        }
    }

    private fun hasMicPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            reactApplicationContext,
            Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED
    }

    companion object {
        private const val TAG = "FilterCameraModule"
        private const val REQUEST_MEDIA_PROJECTION = 0x5043

        private fun stripFileUri(path: String): String {
            if (path.startsWith("file://")) return path.removePrefix("file://")
            if (path.startsWith("file:/")) return path.removePrefix("file:/")
            return path
        }
    }
}
