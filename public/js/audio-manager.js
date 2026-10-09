/**
 * CheerRunners - Audio Manager
 * Handles:
 * - High-clarity Web Audio API synthesised alert chimes (BIP-BIP!)
 * - Push-to-Talk (PTT) audio recording up to 10 seconds max
 * - Post-recording review (preview, cancel/discard, or send)
 * - In-order audio playback queue with automatic notification chimes
 * - Quick cheer soundboard effects (Horn, Whistle, Crowd Cheers)
 */

class AudioManager {
    constructor() {
        this.audioCtx = null;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.isRecording = false;
        this.recordStartTime = 0;
        this.recordTimer = null;
        this.maxRecordDurationMs = 10000; // 10 seconds max
        this.stream = null;
        
        // Review buffer
        this.lastRecordedAudio = null; // { base64Audio, duration }
        this.previewAudioEl = null;
        this.isPreviewPlaying = false;

        // Playback queue
        this.playbackQueue = [];
        this.isPlayingQueue = false;
        this.currentAudioEl = null;

        // Callbacks
        this.onRecordingProgress = null; // (elapsedMs, remainingMs, pct)
        this.onRecordingReadyForReview = null; // ({ base64Audio, duration })
        this.onRecordingStart = null;
        this.onRecordingCancelled = null;
        this.onMessagePlaybackStart = null; // (message)
        this.onMessagePlaybackEnd = null;   // (message)
        this.onAutoplayBlocked = null;      // (message)
    }

    initAudioContext() {
        if (!this.audioCtx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.audioCtx = new AudioContext();
        }
        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume().catch(() => {});
        }
    }

    /**
     * Proactively unlock audio context on any user touch/click gesture
     */
    unlockAudio() {
        this.initAudioContext();
        if (this.audioCtx && this.audioCtx.state === 'suspended') {
            this.audioCtx.resume().catch(() => {});
        }
    }

    /**
     * Synthesises a crisp 2-tone alert chime (BIP-BIP)
     */
    playAlertChime() {
        return new Promise((resolve) => {
            try {
                this.initAudioContext();
                const now = this.audioCtx.currentTime;
                
                // Tone 1: High crisp chirp (880Hz / A5)
                const osc1 = this.audioCtx.createOscillator();
                const gain1 = this.audioCtx.createGain();
                osc1.type = 'sine';
                osc1.frequency.setValueAtTime(880, now);
                gain1.gain.setValueAtTime(0.35, now);
                gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
                osc1.connect(gain1);
                gain1.connect(this.audioCtx.destination);
                osc1.start(now);
                osc1.stop(now + 0.12);

                // Tone 2: Ascending higher confirmation chirp (1320Hz / E6)
                const osc2 = this.audioCtx.createOscillator();
                const gain2 = this.audioCtx.createGain();
                osc2.type = 'sine';
                osc2.frequency.setValueAtTime(1320, now + 0.14);
                gain2.gain.setValueAtTime(0.4, now + 0.14);
                gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.32);
                osc2.connect(gain2);
                gain2.connect(this.audioCtx.destination);
                osc2.start(now + 0.14);
                osc2.stop(now + 0.32);

                setTimeout(resolve, 360);
            } catch (err) {
                console.warn('Could not play alert chime:', err);
                resolve();
            }
        });
    }

    /**
     * Short start/stop recording feedback tone
     */
    playRecordTone(start = true) {
        try {
            this.initAudioContext();
            const now = this.audioCtx.currentTime;
            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(start ? 600 : 400, now);
            if (start) {
                osc.frequency.exponentialRampToValueAtTime(1000, now + 0.08);
            }
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.09);
            osc.connect(gain);
            gain.connect(this.audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.09);
        } catch (e) {
            // Ignore
        }
    }

    /**
     * High-Fidelity Motivational Voice Cheers (WAV)
     */
    playCheerSound(type) {
        this.initAudioContext();
        
        const voiceMap = {
            'gohard': '/audio/cheers/go_hard.wav',
            'yougotthis': '/audio/cheers/you_got_this.wav',
            'vamoporra': '/audio/cheers/vamo_porra.wav',
            'gogogo': '/audio/cheers/go_go_go.wav',
            'justdoit': '/audio/cheers/just_do_it.wav',
            'rumble': '/audio/cheers/rumble.wav',
            'senna': '/audio/cheers/senna.wav',
            'tetra': '/audio/cheers/tetra.wav',
            'siuuu': '/audio/cheers/siuuu.wav',
            // Retrocompatibility aliases
            'horn': '/audio/cheers/go_hard.wav',
            'whistle': '/audio/cheers/go_go_go.wav',
            'applause': '/audio/cheers/you_got_this.wav',
            'boost': '/audio/cheers/vamo_porra.wav'
        };

        const audioUrl = voiceMap[type];
        if (audioUrl) {
            try {
                const sound = new Audio(audioUrl);
                sound.volume = 1.0;
                sound.play().catch((err) => {
                    console.warn('Cheer sound playback notice:', err);
                });
                return;
            } catch (err) {
                console.warn('Error playing voice cheer:', err);
            }
        }
    }

    /**
     * Start Push-to-Talk audio recording (max 10s)
     */
    async startRecording() {
        if (this.isRecording) return;
        this.initAudioContext();
        this.stopPreview();

        try {
            if (!this.stream) {
                this.stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true
                    }
                });
            }

            let mimeType = 'audio/webm;codecs=opus';
            if (!MediaRecorder.isTypeSupported(mimeType)) {
                mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 
                           MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '';
            }

            const options = mimeType ? { mimeType } : {};
            this.mediaRecorder = new MediaRecorder(this.stream, options);
            this.audioChunks = [];

            this.mediaRecorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) {
                    this.audioChunks.push(e.data);
                }
            };

            this.mediaRecorder.onstop = async () => {
                const duration = Math.min(10, Math.max(0.5, (Date.now() - this.recordStartTime) / 1000));
                const audioBlob = new Blob(this.audioChunks, { type: mimeType || 'audio/webm' });
                
                const reader = new FileReader();
                reader.readAsDataURL(audioBlob);
                reader.onloadend = () => {
                    const base64Audio = reader.result;
                    this.lastRecordedAudio = {
                        base64Audio,
                        duration: parseFloat(duration.toFixed(1))
                    };

                    if (this.onRecordingReadyForReview) {
                        this.onRecordingReadyForReview(this.lastRecordedAudio);
                    }
                };
            };

            this.playRecordTone(true);
            this.mediaRecorder.start(100);
            this.isRecording = true;
            this.recordStartTime = Date.now();

            if (this.onRecordingStart) this.onRecordingStart();

            // Progress loop and 10s auto-stop
            const updateInterval = 50;
            this.recordTimer = setInterval(() => {
                const elapsed = Date.now() - this.recordStartTime;
                const remaining = Math.max(0, this.maxRecordDurationMs - elapsed);
                const pct = Math.min(100, (elapsed / this.maxRecordDurationMs) * 100);

                if (this.onRecordingProgress) {
                    this.onRecordingProgress(elapsed, remaining, pct);
                }

                if (elapsed >= this.maxRecordDurationMs) {
                    this.stopRecording();
                }
            }, updateInterval);

        } catch (err) {
            console.error('Failed to start microphone recording:', err);
            alert('Could not access microphone. Please grant audio permissions.');
            this.isRecording = false;
        }
    }

    /**
     * Stop Push-to-Talk audio recording
     */
    stopRecording() {
        if (!this.isRecording) return;
        this.isRecording = false;
        clearInterval(this.recordTimer);
        this.playRecordTone(false);

        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }
    }

    /**
     * Play recorded audio preview before sending
     */
    playPreview(onEndedCallback) {
        if (!this.lastRecordedAudio) return;
        this.stopPreview();

        this.previewAudioEl = new Audio(this.lastRecordedAudio.base64Audio);
        this.isPreviewPlaying = true;

        this.previewAudioEl.onended = () => {
            this.isPreviewPlaying = false;
            if (onEndedCallback) onEndedCallback();
        };

        this.previewAudioEl.play().catch(console.warn);
    }

    stopPreview() {
        if (this.previewAudioEl) {
            try {
                this.previewAudioEl.pause();
                this.previewAudioEl.currentTime = 0;
                this.previewAudioEl.src = '';
                this.previewAudioEl.load();
            } catch (e) {
                // Ignore audio reset error
            }
            this.previewAudioEl = null;
            this.isPreviewPlaying = false;
        }
    }

    /**
     * Cancel and discard recording
     */
    discardRecording() {
        this.stopPreview();
        this.lastRecordedAudio = null;
        if (this.onRecordingCancelled) this.onRecordingCancelled();
    }

    /**
     * Queue incoming audio message and play with leading alert chime
     */
    enqueueIncomingMessage(messageData) {
        this.playbackQueue.push(messageData);
        if (!this.isPlayingQueue) {
            this.processQueue();
        }
    }

    async processQueue() {
        if (this.playbackQueue.length === 0) {
            this.isPlayingQueue = false;
            return;
        }

        this.isPlayingQueue = true;
        const msg = this.playbackQueue.shift();

        try {
            await this.playAlertChime();

            if (this.onMessagePlaybackStart) this.onMessagePlaybackStart(msg);

            // Engine 1: Web Audio API Buffer playback (bypasses mobile HTML5 media element autoplay restrictions once context is running)
            let playedSuccessfully = false;
            try {
                this.initAudioContext();
                if (this.audioCtx && this.audioCtx.state === 'running' && msg.audio) {
                    const arrayBuffer = base64ToArrayBuffer(msg.audio);
                    const audioBuffer = await this.audioCtx.decodeAudioData(arrayBuffer);
                    await new Promise((resolve) => {
                        const source = this.audioCtx.createBufferSource();
                        source.buffer = audioBuffer;
                        source.connect(this.audioCtx.destination);
                        source.onended = () => {
                            if (this.onMessagePlaybackEnd) this.onMessagePlaybackEnd(msg);
                            resolve();
                        };
                        source.start(0);
                    });
                    playedSuccessfully = true;
                }
            } catch (webAudioErr) {
                console.warn('Web Audio API buffer decode fallback to HTML5 Audio:', webAudioErr);
            }

            // Engine 2: HTML5 Audio element fallback
            if (!playedSuccessfully) {
                await new Promise((resolve) => {
                    const audio = new Audio(msg.audio);
                    this.currentAudioEl = audio;
                    
                    audio.onended = () => {
                        this.currentAudioEl = null;
                        if (this.onMessagePlaybackEnd) this.onMessagePlaybackEnd(msg);
                        resolve();
                    };

                    audio.onerror = (e) => {
                        console.warn('Audio playback error:', e);
                        this.currentAudioEl = null;
                        if (this.onMessagePlaybackEnd) this.onMessagePlaybackEnd(msg);
                        resolve();
                    };

                    audio.play().catch((err) => {
                        console.warn('Auto-play blocked or failed:', err);
                        this.currentAudioEl = null;
                        if (this.onAutoplayBlocked) this.onAutoplayBlocked(msg);
                        if (this.onMessagePlaybackEnd) this.onMessagePlaybackEnd(msg);
                        resolve();
                    });
                });
            }

            await new Promise((r) => setTimeout(r, 350));
        } catch (err) {
            console.error('Error processing audio queue:', err);
        }

        this.processQueue();
    }
}

/**
 * Helper to convert Base64 Data URI into ArrayBuffer for Web Audio API
 */
function base64ToArrayBuffer(base64DataUri) {
    const base64 = base64DataUri.includes(',') ? base64DataUri.split(',')[1] : base64DataUri;
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

window.AudioManager = AudioManager;
