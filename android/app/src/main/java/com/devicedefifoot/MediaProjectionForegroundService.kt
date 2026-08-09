package com.devicedefifoot

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class MediaProjectionForegroundService : Service() {

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        isForeground = false
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startAsForeground()
        return START_NOT_STICKY
    }

    private fun startAsForeground() {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "Enregistrement vidéo", NotificationManager.IMPORTANCE_LOW)
            )
        }
        val builder: Notification.Builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            Notification.Builder(this)
        }
        val notification = builder
            .setContentTitle("Football_Challenge")
            .setContentText("Enregistrement vidéo avec filtre en cours")
            .setSmallIcon(android.R.drawable.ic_media_play)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(1, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
        } else {
            startForeground(1, notification)
        }
        isForeground = true
        readyLatch.countDown()
    }

    override fun onDestroy() {
        isForeground = false
        super.onDestroy()
    }

    companion object {
        private const val CHANNEL_ID = "media_projection_channel"

        @Volatile
        var isForeground: Boolean = false
            private set

        @Volatile
        private var readyLatch: CountDownLatch = CountDownLatch(1)

        fun start(context: Context) {
            context.startForegroundService(Intent(context, MediaProjectionForegroundService::class.java))
        }

        fun awaitForeground(timeoutMs: Long): Boolean {
            val latch = readyLatch
            return try {
                latch.await(timeoutMs, TimeUnit.MILLISECONDS)
            } catch (e: InterruptedException) {
                false
            }
        }

        fun resetLatch() {
            readyLatch = CountDownLatch(1)
            isForeground = false
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, MediaProjectionForegroundService::class.java))
        }
    }
}
