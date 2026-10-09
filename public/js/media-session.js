/**
 * CheerRunners - Media Session & Hands-Free Controller
 * Enables:
 * - Bluetooth earphone button control (Play/Pause/Next track mapped to Push-to-Talk)
 * - Screen WakeLock API to keep phone display awake during the run
 * - No-look giant touch target interaction for runners
 */

class MediaSessionManager {
    constructor(audioManager) {
        this.audioManager = audioManager;
        this.wakeLock = null;
        this.onHardwareButtonPressed = null; // Callback when Bluetooth button is tapped
        this.isSilentAudioPlaying = false;
        this.silentAudioElement = null;
    }

    /**
     * Initializes MediaSession so mobile OS registers Bluetooth headset controls
     */
    initMediaSession() {
        if (!('mediaSession' in navigator)) {
            console.log('MediaSession API not supported in this browser.');
            return;
        }

        // Set rich metadata visible on smartwatch / lock screen
        navigator.mediaSession.metadata = new MediaMetadata({
            title: 'CheerRunners Walkie-Talkie',
            artist: 'Live Run Companion',
            album: 'Cheer & Voice Relay',
            artwork: [
                { src: '/img/icon-192.png', sizes: '192x192', type: 'image/png' },
                { src: '/img/icon-512.png', sizes: '512x512', type: 'image/png' }
            ]
        });

        // Register hardware action handlers (Bluetooth earphone buttons)
        const handleAction = () => {
            console.log('[HEADSET ACTION] Bluetooth button triggered!');
            if (this.onHardwareButtonPressed) {
                this.onHardwareButtonPressed();
            }
        };

        try {
            navigator.mediaSession.setActionHandler('play', handleAction);
            navigator.mediaSession.setActionHandler('pause', handleAction);
            navigator.mediaSession.setActionHandler('nexttrack', handleAction);
            navigator.mediaSession.setActionHandler('previoustrack', handleAction);
        } catch (e) {
            console.warn('Could not register some media session handlers:', e);
        }

        // Keep media session active in background via tiny silent audio loop
        this.startSilentAudioLoop();
    }

    /**
     * Mobile browsers require active audio to keep MediaSession handlers bound
     */
    startSilentAudioLoop() {
        if (this.isSilentAudioPlaying) return;
        try {
            // 1-second silent WAV base64
            const silentWav = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==';
            this.silentAudioElement = new Audio(silentWav);
            this.silentAudioElement.loop = true;
            this.silentAudioElement.volume = 0.01;
            this.silentAudioElement.play().catch(() => {
                // Will play on first user interaction
            });
            this.isSilentAudioPlaying = true;
        } catch (e) {
            // Ignore
        }
    }

    /**
     * Requests Screen WakeLock to prevent the display from locking while in an armband
     */
    async requestWakeLock() {
        if ('wakeLock' in navigator) {
            try {
                this.wakeLock = await navigator.wakeLock.request('screen');
                console.log('Screen WakeLock active (Display will stay awake during run)');
                
                this.wakeLock.addEventListener('release', () => {
                    console.log('Screen WakeLock released');
                    this.wakeLock = null;
                });
            } catch (err) {
                console.warn(`Screen WakeLock failed: ${err.name}, ${err.message}`);
            }
        }
    }

    releaseWakeLock() {
        if (this.wakeLock !== null) {
            this.wakeLock.release();
            this.wakeLock = null;
        }
    }
}

window.MediaSessionManager = MediaSessionManager;
