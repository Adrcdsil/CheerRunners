/**
 * CheerRunners - Main Application Coordinator
 * Handles:
 * - Room Registration & Management (Presets: MM SAT 5k 10k, MM SUN 21k 42k, etc.)
 * - Room Switching in Real-time via WebSocket
 * - User Profiles with Initials, Sports Avatars, or Photo upload
 * - Targeted Walkie-Talkie Messaging (Broadcast to Room vs Direct User Audio)
 * - Post-Recording Audio Review (Listen, Discard, Send)
 * - Live GPS Geolocation Tracking & Leaflet Map Rendering
 * - Hands-free Bluetooth Headset Button Integration & Screen WakeLock
 */

document.addEventListener('DOMContentLoaded', () => {
    // Application State - session-unique user ID for seamless multi-tab local testing
    const sessionUserId = sessionStorage.getItem('cr_session_user_id') || ('user_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7));
    sessionStorage.setItem('cr_session_user_id', sessionUserId);

    const state = {
        roomId: localStorage.getItem('cr_room_id') || 'MM SUN 21 42',
        user: {
            id: sessionUserId,
            name: localStorage.getItem('cr_name') || '',
            role: localStorage.getItem('cr_role') || 'runner',
            avatarType: localStorage.getItem('cr_avatar_type') || 'initials',
            avatarValue: localStorage.getItem('cr_avatar_value') || 'CR',
            avatarColor: localStorage.getItem('cr_avatar_color') || '#e11d48'
        },
        availableRooms: [],
        selectedTargetUserId: 'all', // 'all' or specific user ID
        users: new Map(), // id -> user object
        ws: null,
        isConnected: false,
        activeRunnerId: null
    };

    // Subsystems
    const audioManager = new AudioManager();
    const locationManager = new LocationManager();
    const mapManager = new MapManager('map');
    const mediaSessionManager = new MediaSessionManager(audioManager);

    // Global Proactive Audio Unlock on any user gesture (essential for mobile Web Audio & Autoplay)
    const unlockAudioOnTouch = () => {
        if (audioManager) {
            audioManager.unlockAudio();
        }
    };
    ['pointerdown', 'touchstart', 'click', 'keydown'].forEach((evt) => {
        document.addEventListener(evt, unlockAudioOnTouch, { passive: true });
    });

    // Audio Echo Suppression - Cache signatures of voice notes sent by this device
    const mySentVoiceSignatures = new Set();

    // Safe Universal Fullscreen Request Helper (activated by user interaction gestures)
    function requestAppFullscreen() {
        try {
            const doc = document.documentElement;
            if (!document.fullscreenElement && !document.webkitFullscreenElement) {
                if (doc.requestFullscreen) {
                    doc.requestFullscreen().catch(() => {});
                } else if (doc.webkitRequestFullscreen) {
                    doc.webkitRequestFullscreen();
                }
            }
        } catch (err) {
            // Silently ignore browser security restrictions
        }
    }

    // DOM Elements - Profile & Join Modal
    const joinModal = document.getElementById('join-modal');
    const inputName = document.getElementById('input-name');
    const selectRegisteredRunner = document.getElementById('select-registered-runner');
    const btnChoiceRunner = document.getElementById('role-choice-runner') || document.getElementById('role-runner');
    const btnChoiceCheer = document.getElementById('role-choice-cheer') || document.getElementById('role-cheer');
    const btnSelectRunner = btnChoiceRunner;
    const btnSelectCheer = btnChoiceCheer;
    const rolePunchline = document.getElementById('role-punchline');
    const rolePunchlineText = document.getElementById('role-punchline-text');
    const btnStart = document.getElementById('btn-start-run');
    const roomBadge = document.getElementById('room-display-badge');
    const btnOpenRoomsModal = document.getElementById('btn-open-rooms-modal');
    const connectionStatus = document.getElementById('connection-status');
    const usersCountEl = document.getElementById('online-users-count');
    const headerUserAvatar = document.getElementById('header-user-avatar');
    const headerUserName = document.getElementById('header-user-name');

    // Rooms Elements
    const joinRoomsList = document.getElementById('join-rooms-list');
    const btnToggleCreateRoomJoin = document.getElementById('btn-toggle-create-room-join');
    const createRoomJoinBox = document.getElementById('create-room-join-box');
    const inputNewRoomName = document.getElementById('input-new-room-name');
    const btnSubmitNewRoomJoin = document.getElementById('btn-submit-new-room-join');
    const raceDayCards = document.querySelectorAll('.race-day-card');

    // Room Switcher Modal Elements
    const roomsModal = document.getElementById('rooms-modal');
    const btnCloseRoomsModal = document.getElementById('btn-close-rooms-modal');
    const switcherRoomsList = document.getElementById('switcher-rooms-list');
    const btnToggleCreateRoomModal = document.getElementById('btn-toggle-create-room-modal');
    const createRoomModalBox = document.getElementById('create-room-modal-box');
    const modalInputRoomName = document.getElementById('modal-input-room-name');
    const modalInputRoomDesc = document.getElementById('modal-input-room-desc');
    const btnSubmitNewRoomModal = document.getElementById('btn-submit-new-room-modal');

    // Profile Preview & Race Pass Crachá
    const previewAvatarBadge = document.getElementById('preview-avatar-badge');
    const previewAvatarText = document.getElementById('preview-avatar-text');
    const previewAvatarImg = document.getElementById('preview-avatar-img');
    const previewDisplayName = document.getElementById('preview-display-name');
    const previewDisplayRole = document.getElementById('preview-display-role');
    const previewDisplayRoom = document.getElementById('preview-display-room');
    const passNameDisplay = document.getElementById('pass-name-display');
    const passRoleBadge = document.getElementById('pass-role-badge');
    const passRoomPill = document.getElementById('pass-room-pill');
    const btnTriggerAvatarDrawer = document.getElementById('btn-trigger-avatar-drawer');
    const avatarCustomiseDrawer = document.getElementById('avatar-customise-drawer');
    const screen2AvatarCircle = document.getElementById('screen2-avatar-circle');
    const screen2AvatarText = document.getElementById('screen2-avatar-text');
    const screen3RoomTag = document.getElementById('screen3-room-tag');
    const raceDayPills = document.querySelectorAll('.race-day-pill');

    // Wizard Stepper & Panels (Mobile Wireframe Navigation)
    const wizardStepTitle = document.getElementById('wizard-step-title');
    const wizardStepSubtitle = document.getElementById('wizard-step-subtitle');
    const wizardDashes = document.querySelectorAll('.wizard-dot');
    const stepSummaryBar = document.getElementById('step-summary-bar');
    const wizardStep1 = document.getElementById('wizard-step-1');
    const wizardStep2 = document.getElementById('wizard-step-2');
    const wizardStep3 = document.getElementById('wizard-step-3');
    const qrWelcomeBanner = document.getElementById('qr-welcome-banner');
    const qrBannerGreeting = document.getElementById('qr-banner-greeting');
    const qrBannerMessage = document.getElementById('qr-banner-message');
    const btnBottomPrev = document.getElementById('btn-bottom-prev');
    const btnBottomNext = document.getElementById('btn-bottom-next');
    const btnStep1Next = document.getElementById('btn-step1-next') || btnBottomNext;
    const btnStep2Prev = document.getElementById('btn-step2-prev') || btnBottomPrev;
    const btnStep2Next = document.getElementById('btn-step2-next') || btnBottomNext;
    const btnStep3Prev = document.getElementById('btn-step3-prev') || btnBottomPrev;
    const btnWizardStep1Next = btnStep1Next;
    const btnWizardStep2Prev = btnStep2Prev;
    const btnWizardStep2Next = btnStep2Next;
    const btnWizardStep3Prev = btnStep3Prev;
    const btnStartRunText = document.getElementById('btn-start-run-text');

    // Avatar Selector Elements
    const avatarTabs = document.querySelectorAll('.btn-tab');
    const tabInitials = document.getElementById('tab-initials');
    const tabEmoji = document.getElementById('tab-emoji');
    const tabPhoto = document.getElementById('tab-photo');
    const colorDots = document.querySelectorAll('.btn-color-dot');
    const emojiButtons = document.querySelectorAll('.btn-emoji-select');
    const inputAvatarFile = document.getElementById('input-avatar-file');

    // Recipient Selector
    const recipientChipsList = document.getElementById('recipient-chips-list');

    // Post-Recording Review Elements
    const recordingReviewBar = document.getElementById('recording-review-bar');
    const reviewDurationText = document.getElementById('review-duration-text');
    const btnReviewListen = document.getElementById('btn-review-listen');
    const btnReviewDiscard = document.getElementById('btn-review-discard');
    const btnReviewSend = document.getElementById('btn-review-send');
    const btnReviewSendLabel = document.getElementById('btn-review-send-label');

    // Runner Dashboard Elements
    const statPace = document.getElementById('stat-pace');
    const statDistance = document.getElementById('stat-distance');
    const statSpeed = document.getElementById('stat-speed');
    const statEta = document.getElementById('stat-eta');
    const etaContainer = document.getElementById('eta-card');

    // PTT Elements
    const pttContainer = document.querySelector('.ptt-container');
    const btnPtt = document.getElementById('btn-ptt');
    const pttStatusText = document.getElementById('ptt-status-text');
    const pttProgressCircle = document.getElementById('ptt-progress-circle');
    const pttTimerText = document.getElementById('ptt-timer-text');
    const incomingCheerBanner = document.getElementById('incoming-cheer-banner');
    const incomingSenderName = document.getElementById('incoming-sender-name');
    const incomingSenderAvatar = document.getElementById('incoming-sender-avatar');
    const incomingMsgType = document.getElementById('incoming-msg-type');

    // Feed
    const messageFeed = document.getElementById('message-feed');

    // Map & HUD Controls
    const btnRecenter = document.getElementById('btn-recenter');
    const btnToggleSim = document.getElementById('btn-toggle-sim');
    const btnToggleHud = document.getElementById('btn-toggle-hud');
    const btnShareRoom = document.getElementById('btn-share-room');
    const hudModal = document.getElementById('hud-modal');
    const hudPace = document.getElementById('hud-pace');
    const hudDistance = document.getElementById('hud-distance');
    const btnHudPtt = document.getElementById('btn-hud-ptt');
    const btnCloseHud = document.getElementById('btn-close-hud');

    // ==========================================
    // VIP Access Gate Security (Password: IrizarMM2026 or QR Code Bypass)
    // ==========================================
    const OFFICIAL_ACCESS_KEY = 'IrizarMM2026';
    const accessGateModal = document.getElementById('access-gate-modal');
    const gateForm = document.getElementById('gate-form');
    const inputAccessKey = document.getElementById('input-access-key');
    const gateErrorMsg = document.getElementById('gate-error-msg');
    const btnToggleGatePwd = document.getElementById('btn-toggle-gate-pwd');

    function checkAccessSecurity() {
        const urlParams = new URLSearchParams(window.location.search);
        const urlKey = urlParams.get('key') || urlParams.get('pass') || urlParams.get('access') || urlParams.get('auth');
        
        // 1. Automatic 1-tap bypass if scanned via QR Code with valid key
        if (urlKey && urlKey.trim().toLowerCase() === OFFICIAL_ACCESS_KEY.toLowerCase()) {
            localStorage.setItem('cr_vip_access_pass', OFFICIAL_ACCESS_KEY);
            // Clean URL query param without full page refresh
            const cleanUrl = window.location.origin + window.location.pathname;
            window.history.replaceState({}, document.title, cleanUrl);
        }

        // 2. Check stored authorization
        const isAuthorized = (localStorage.getItem('cr_vip_access_pass') === OFFICIAL_ACCESS_KEY);
        if (isAuthorized) {
            if (accessGateModal) {
                accessGateModal.classList.add('hidden');
                accessGateModal.style.setProperty('display', 'none', 'important');
            }
        } else {
            if (accessGateModal) {
                accessGateModal.classList.remove('hidden');
                accessGateModal.style.removeProperty('display');
                accessGateModal.style.display = 'flex';
                setTimeout(() => {
                    if (inputAccessKey) inputAccessKey.focus();
                }, 300);
            }
        }
    }

    if (gateForm) {
        gateForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const entered = (inputAccessKey?.value || '').trim();
            if (entered.toLowerCase() === OFFICIAL_ACCESS_KEY.toLowerCase()) {
                localStorage.setItem('cr_vip_access_pass', OFFICIAL_ACCESS_KEY);
                if (gateErrorMsg) gateErrorMsg.style.display = 'none';
                if (accessGateModal) {
                    accessGateModal.classList.add('hidden');
                    accessGateModal.style.setProperty('display', 'none', 'important');
                }
            } else {
                if (gateErrorMsg) {
                    gateErrorMsg.style.display = 'block';
                    gateErrorMsg.classList.remove('hidden');
                }
                const card = accessGateModal ? (accessGateModal.querySelector('.gate-minimal-wrap') || accessGateModal.querySelector('.gate-card')) : null;
                if (card) {
                    card.classList.add('gate-shake');
                    setTimeout(() => card.classList.remove('gate-shake'), 500);
                }
                if (inputAccessKey) {
                    inputAccessKey.select();
                    inputAccessKey.focus();
                }
            }
        });
    }

    if (btnToggleGatePwd && inputAccessKey) {
        btnToggleGatePwd.addEventListener('click', () => {
            const isPwd = inputAccessKey.type === 'password';
            inputAccessKey.type = isPwd ? 'text' : 'password';
            btnToggleGatePwd.textContent = isPwd ? '🙈' : '👁️';
        });
    }

    // Run security check immediately on boot
    checkAccessSecurity();

    // ==========================================
    // Fetch & Manage Rooms & Registered Athletes
    // ==========================================
    async function loadRoomsFromApi() {
        try {
            const res = await fetch('/api/rooms');
            if (res.ok) {
                state.availableRooms = await res.json();
                renderRoomsGrid(joinRoomsList, true);
                renderRoomsGrid(switcherRoomsList, false);
            }
        } catch (e) {
            console.warn('Could not fetch rooms from API:', e);
            state.availableRooms = [
                { id: "MM SAT 5 10", name: "MM SAT 5 10", description: "Saturday - 5k & 10k", activeUsersCount: 0 },
                { id: "MM SUN 21 42", name: "MM SUN 21 42", description: "Sunday - 21.1k & 42.2k", activeUsersCount: 0 }
            ];
            renderRoomsGrid(joinRoomsList, true);
            renderRoomsGrid(switcherRoomsList, false);
        }

        // Also load registered athlete roster into join modal
        await loadRegisteredRunners();
    }

    let registeredRunnersRoster = [];
    const btnToggleNameDropdown = document.getElementById('btn-toggle-name-dropdown');
    const nameAutocompleteDropdown = document.getElementById('name-autocomplete-dropdown');

    function renderNameDropdown(filterText = '') {
        if (!nameAutocompleteDropdown) return;
        // Never show runner roster for cheer squad
        if (state.user.role === 'cheer') {
            hideNameDropdown();
            return;
        }

        const query = (filterText || '').trim().toLowerCase();
        const matches = registeredRunnersRoster.filter(u => {
            if (!query) return true;
            return (u.name || '').toLowerCase().includes(query) || (u.distance || '').toLowerCase().includes(query);
        });

        if (matches.length === 0) {
            nameAutocompleteDropdown.innerHTML = `<div class="combobox-empty">No registered athletes match "${filterText || ''}". Custom runner name allowed.</div>`;
            return;
        }

        nameAutocompleteDropdown.innerHTML = '';
        matches.forEach(u => {
            const item = document.createElement('div');
            item.className = 'combobox-item';
            const initials = u.avatarValue || calculateInitials(u.name);
            const col = u.avatarColor || '#ee2737';
            const distBadge = u.distance ? `<span class="combobox-item-badge">${u.distance}</span>` : '';
            item.innerHTML = `
                <div class="combobox-item-avatar" style="background: ${col};">${initials}</div>
                <div class="combobox-item-name">${u.name}</div>
                ${distBadge}
            `;
            item.addEventListener('click', () => {
                selectAthlete(u);
                hideNameDropdown();
            });
            nameAutocompleteDropdown.appendChild(item);
        });
    }

    function selectAthlete(u) {
        state.user.id = u.id;
        state.user.name = u.name;
        state.user.role = 'runner';
        state.user.avatarType = u.avatarType || 'initials';
        state.user.avatarValue = u.avatarValue || calculateInitials(u.name);
        state.user.avatarColor = u.avatarColor || '#ee2737';

        if (inputName) inputName.value = u.name;

        localStorage.setItem('cr_user_id', u.id);
        localStorage.setItem('cr_name', u.name);
        localStorage.setItem('cr_role', 'runner');
        localStorage.setItem('cr_avatar_type', state.user.avatarType);
        localStorage.setItem('cr_avatar_value', state.user.avatarValue);
        localStorage.setItem('cr_avatar_color', state.user.avatarColor);

        if (u.defaultRoom) {
            state.roomId = u.defaultRoom;
            localStorage.setItem('cr_room_id', u.defaultRoom);
            if (roomBadge) roomBadge.textContent = u.defaultRoom;
            if (passRoomPill) passRoomPill.textContent = u.defaultRoom;
            if (screen3RoomTag) screen3RoomTag.textContent = u.defaultRoom;

            if (raceDayPills) {
                raceDayPills.forEach(pill => {
                    if (pill.dataset.room === u.defaultRoom) {
                        pill.classList.add('active');
                    } else {
                        pill.classList.remove('active');
                    }
                });
            }
        }
        updateProfilePreview();
    }

    function showNameDropdown() {
        if (!nameAutocompleteDropdown || state.user.role === 'cheer') return;
        renderNameDropdown(inputName ? inputName.value : '');
        nameAutocompleteDropdown.classList.remove('hidden');
        nameAutocompleteDropdown.style.removeProperty('display');
    }

    function hideNameDropdown() {
        if (!nameAutocompleteDropdown) return;
        nameAutocompleteDropdown.classList.add('hidden');
        nameAutocompleteDropdown.style.setProperty('display', 'none', 'important');
    }

    if (btnToggleNameDropdown) {
        btnToggleNameDropdown.addEventListener('click', (e) => {
            e.stopPropagation();
            if (nameAutocompleteDropdown && !nameAutocompleteDropdown.classList.contains('hidden')) {
                hideNameDropdown();
            } else {
                showNameDropdown();
            }
        });
    }

    if (inputName) {
        inputName.addEventListener('input', () => {
            if (state.user.role === 'runner') {
                showNameDropdown();
            }
        });
        inputName.addEventListener('focus', () => {
            if (state.user.role === 'runner' && registeredRunnersRoster.length > 0) {
                showNameDropdown();
            }
        });
    }

    document.addEventListener('click', (e) => {
        const wrap = document.getElementById('name-combobox-wrap');
        if (wrap && !wrap.contains(e.target)) {
            hideNameDropdown();
        }
    });

    async function loadRegisteredRunners() {
        try {
            const res = await fetch('/api/users?registeredOnly=true&role=runner');
            if (!res.ok) return;
            const roster = await res.json();

            // Deduplicate strictly by ID and filter official runners
            const seenIds = new Set();
            const validRunners = roster.filter(u => {
                if (!u.id || seenIds.has(u.id)) return false;
                seenIds.add(u.id);
                return u.role === 'runner' || (u.id && u.id.startsWith('runner_'));
            });

            // Sort alphabetically by name
            validRunners.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            registeredRunnersRoster = validRunners;

            if (selectRegisteredRunner) {
                selectRegisteredRunner.innerHTML = '<option value="">-- Choose Runner from Roster (Optional) --</option>';
                validRunners.forEach(u => {
                    const opt = document.createElement('option');
                    opt.value = u.id;
                    const distanceBadge = u.distance ? ` [${u.distance}]` : '';
                    opt.textContent = `${u.name}${distanceBadge} (${u.avatarValue || 'CR'})`;
                    opt.dataset.user = JSON.stringify(u);
                    selectRegisteredRunner.appendChild(opt);
                });
            }
        } catch (e) {
            console.warn('Could not fetch registered runners:', e);
        }
    }

    function renderRoomsGrid(container, isJoinModal) {
        if (!container) return;
        container.innerHTML = '';

        state.availableRooms.forEach((room) => {
            const card = document.createElement('div');
            const isActive = room.id.toUpperCase() === state.roomId.toUpperCase();
            card.className = `room-card ${isActive ? 'active' : ''}`;

            const userCountText = room.activeUsersCount ? `${room.activeUsersCount} Live` : 'Ready';

            card.innerHTML = `
                <div class="room-card-info">
                    <div class="room-card-title">
                        <span>🏁</span>
                        <span>${room.name}</span>
                    </div>
                    <div class="room-card-desc">${room.description || room.category || 'Race Event'}</div>
                </div>
                <div class="room-card-badge">${userCountText}</div>
            `;

            card.addEventListener('click', () => {
                state.roomId = room.id;
                localStorage.setItem('cr_room_id', room.id);
                roomBadge.textContent = room.name;

                // Mark card as active
                container.querySelectorAll('.room-card').forEach((c) => c.classList.remove('active'));
                card.classList.add('active');
                updateProfilePreview();

                if (!isJoinModal) {
                    // Instantly switch rooms over WebSocket!
                    switchRoom(room.id);
                    roomsModal.classList.add('hidden');
                    roomsModal.style.setProperty('display', 'none', 'important');
                }
            });

            container.appendChild(card);
        });
    }

    async function createNewRoom(name, desc) {
        if (!name || !name.trim()) return null;
        try {
            const res = await fetch('/api/rooms', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: name.trim(),
                    description: desc || 'Custom Community Run',
                    category: 'Community Run'
                })
            });
            if (res.ok) {
                const data = await res.json();
                await loadRoomsFromApi();
                return data.room;
            }
        } catch (e) {
            console.error('Failed to create new room:', e);
        }
        return null;
    }

    // Toggle Create Room inside Join Modal (if present)
    if (btnToggleCreateRoomJoin && createRoomJoinBox && inputNewRoomName) {
        btnToggleCreateRoomJoin.addEventListener('click', () => {
            const isHidden = createRoomJoinBox.classList.contains('hidden');
            if (isHidden) {
                createRoomJoinBox.classList.remove('hidden');
                createRoomJoinBox.style.removeProperty('display');
                inputNewRoomName.focus();
            } else {
                createRoomJoinBox.classList.add('hidden');
                createRoomJoinBox.style.setProperty('display', 'none', 'important');
            }
        });
    }

    if (btnSubmitNewRoomJoin && inputNewRoomName) {
        btnSubmitNewRoomJoin.addEventListener('click', async () => {
            const name = inputNewRoomName.value.trim();
            if (!name) return;
            const room = await createNewRoom(name);
            if (room) {
                state.roomId = room.id;
                localStorage.setItem('cr_room_id', room.id);
                if (roomBadge) roomBadge.textContent = room.name;
                if (createRoomJoinBox) {
                    createRoomJoinBox.classList.add('hidden');
                    createRoomJoinBox.style.setProperty('display', 'none', 'important');
                }
                inputNewRoomName.value = '';
            }
        });
    }

    // Room Switcher Modal Controls
    btnOpenRoomsModal.addEventListener('click', async () => {
        await loadRoomsFromApi();
        roomsModal.classList.remove('hidden');
        roomsModal.style.removeProperty('display');
    });

    btnCloseRoomsModal.addEventListener('click', () => {
        roomsModal.classList.add('hidden');
        roomsModal.style.setProperty('display', 'none', 'important');
    });

    btnToggleCreateRoomModal.addEventListener('click', () => {
        const isHidden = createRoomModalBox.classList.contains('hidden');
        if (isHidden) {
            createRoomModalBox.classList.remove('hidden');
            createRoomModalBox.style.removeProperty('display');
            modalInputRoomName.focus();
        } else {
            createRoomModalBox.classList.add('hidden');
            createRoomModalBox.style.setProperty('display', 'none', 'important');
        }
    });

    btnSubmitNewRoomModal.addEventListener('click', async () => {
        const name = modalInputRoomName.value.trim();
        const desc = modalInputRoomDesc.value.trim();
        if (!name) return;
        const room = await createNewRoom(name, desc);
        if (room) {
            state.roomId = room.id;
            localStorage.setItem('cr_room_id', room.id);
            roomBadge.textContent = room.name;
            switchRoom(room.id);
            roomsModal.classList.add('hidden');
            roomsModal.style.setProperty('display', 'none', 'important');
            createRoomModalBox.classList.add('hidden');
            createRoomModalBox.style.setProperty('display', 'none', 'important');
            modalInputRoomName.value = '';
            modalInputRoomDesc.value = '';
        }
    });

    function switchRoom(newRoomId) {
        state.roomId = newRoomId;
        roomBadge.textContent = newRoomId;
        state.users.clear();
        state.activeRunnerId = null;
        mapManager.resetRoute();
        mapManager.loadRoomCourses(newRoomId);
        updateRecipientChips();
        usersCountEl.textContent = '1 Active';

        if (state.ws && state.isConnected) {
            state.ws.send(JSON.stringify({
                type: 'switch_room',
                newRoomId: newRoomId
            }));
        }

        // Re-broadcast own location to the new room
        if (locationManager.currentLocation && state.ws && state.isConnected) {
            state.ws.send(JSON.stringify({
                type: 'location_update',
                roomId: state.roomId,
                location: locationManager.currentLocation
            }));
        }
    }

    // ==========================================
    // Profile & Avatar Logic
    // ==========================================
    function calculateInitials(name) {
        if (!name) return 'CR';
        const parts = name.trim().split(/\s+/);
        if (parts.length === 1) {
            return parts[0].substring(0, 2).toUpperCase();
        }
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }

    function syncAvatarColorDots() {
        const curColor = (state.user.avatarColor || '#ee2737').toLowerCase();
        colorDots.forEach((d) => {
            if (d.dataset.color.toLowerCase() === curColor) {
                d.classList.add('active');
            } else {
                d.classList.remove('active');
            }
        });
    }

    function formatRoomShort(roomId) {
        if (!roomId) return '21/42';
        const str = String(roomId).toUpperCase();
        if (str.includes('5') && str.includes('10')) return '5/10';
        if (str.includes('21') || str.includes('42')) return '21/42';
        return roomId;
    }

    function updateProfilePreview() {
        const name = (inputName && inputName.value ? inputName.value.trim() : '') || state.user.name || 'Athlete';
        const firstName = name.trim().split(/\s+/)[0] || 'Athlete';
        if (headerUserName) headerUserName.textContent = firstName;
        if (roomBadge) roomBadge.textContent = formatRoomShort(state.roomId);
        if (previewDisplayName) previewDisplayName.textContent = name;
        if (previewDisplayRole) previewDisplayRole.textContent = state.user.role === 'runner' ? '🏃 Runner' : '📣 Cheer Squad';
        if (passNameDisplay) passNameDisplay.textContent = name;
        if (passRoleBadge) {
            passRoleBadge.textContent = state.user.role === 'cheer' ? 'CHEER SQUAD' : 'RUNNER';
            passRoleBadge.classList.toggle('cheer', state.user.role === 'cheer');
        }
        if (passRoomPill) {
            passRoomPill.textContent = state.roomId || 'MM SUN 21 42';
        }
        if (screen3RoomTag) {
            screen3RoomTag.textContent = state.roomId || 'MM SUN 21 42';
        }

        const passHeroAuraEl = document.getElementById('pass-hero-aura');
        if (passHeroAuraEl) {
            const col = state.user.avatarColor || '#ee2737';
            if (state.user.avatarType === 'initials') {
                passHeroAuraEl.style.background = `radial-gradient(circle, ${col}66 0%, ${col}00 70%)`;
            } else {
                passHeroAuraEl.style.background = `radial-gradient(circle, rgba(238, 39, 55, 0.35) 0%, rgba(238, 39, 55, 0) 70%)`;
            }
        }

        if (state.user.avatarType === 'initials') {
            state.user.avatarValue = calculateInitials(name);
            const isWhite = (state.user.avatarColor === '#ffffff' || state.user.avatarColor === '#fff');
            const col = state.user.avatarColor || '#ee2737';
            previewAvatarBadge.style.background = col;
            previewAvatarBadge.style.borderColor = isWhite ? '#cbd5e1' : col;
            previewAvatarBadge.style.color = isWhite ? '#0b0e14' : '#ffffff';
            previewAvatarBadge.style.boxShadow = isWhite ? '0 0 16px rgba(255, 255, 255, 0.5)' : `0 0 16px ${col}66`;
            previewAvatarText.textContent = state.user.avatarValue;
            previewAvatarText.classList.remove('hidden');
            previewAvatarText.style.removeProperty('display');
            previewAvatarImg.classList.add('hidden');
            previewAvatarImg.style.setProperty('display', 'none', 'important');

            if (screen2AvatarCircle) {
                screen2AvatarCircle.style.background = col;
                screen2AvatarCircle.style.borderColor = isWhite ? '#cbd5e1' : col;
                screen2AvatarCircle.style.color = isWhite ? '#0b0e14' : '#ffffff';
            }
            if (screen2AvatarText) {
                screen2AvatarText.textContent = state.user.avatarValue;
            }
        } else if (state.user.avatarType === 'emoji') {
            previewAvatarBadge.style.background = '#182030';
            previewAvatarBadge.style.borderColor = 'rgba(255, 255, 255, 0.2)';
            previewAvatarBadge.style.color = '#ffffff';
            previewAvatarBadge.style.boxShadow = 'none';
            previewAvatarText.textContent = state.user.avatarValue || '🏃';
            previewAvatarText.classList.remove('hidden');
            previewAvatarText.style.removeProperty('display');
            previewAvatarImg.classList.add('hidden');
            previewAvatarImg.style.setProperty('display', 'none', 'important');

            if (screen2AvatarCircle) {
                screen2AvatarCircle.style.background = '#182030';
                screen2AvatarCircle.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                screen2AvatarCircle.style.color = '#ffffff';
            }
            if (screen2AvatarText) {
                screen2AvatarText.textContent = state.user.avatarValue || '🏃';
            }
        } else if (state.user.avatarType === 'photo') {
            previewAvatarBadge.style.background = '#182030';
            previewAvatarBadge.style.borderColor = 'rgba(255, 255, 255, 0.2)';
            previewAvatarBadge.style.color = '#ffffff';
            previewAvatarBadge.style.boxShadow = 'none';
            previewAvatarText.classList.add('hidden');
            previewAvatarText.style.setProperty('display', 'none', 'important');
            previewAvatarImg.classList.remove('hidden');
            previewAvatarImg.style.removeProperty('display');
            previewAvatarImg.src = state.user.avatarValue;

            if (screen2AvatarCircle) {
                screen2AvatarCircle.innerHTML = `<img src="${state.user.avatarValue}" alt="Avatar" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
            }
        }

        if (previewDisplayRoom) {
            previewDisplayRoom.textContent = state.roomId || 'MM SUN 21 42';
        }
        if (btnStartRunText) {
            btnStartRunText.textContent = state.user.role === 'cheer' ? 'Join & Start Cheering' : 'Join & Start Live Run';
        }

        renderAvatarElement(headerUserAvatar, state.user);
    }

    // ==========================================
    // 3-Screen Mobile Wireframe Navigation Controller
    // ==========================================
    let currentWizardStep = 1;
    let roleChosen = false;

    function goToWizardStep(stepNumber) {
        if (stepNumber < 1 || stepNumber > 3) return;

        // Validation when trying to advance from screen 2 to screen 3
        if (stepNumber > 2 && (!inputName.value || !inputName.value.trim())) {
            alert('Please enter your name or choose an athlete from the roster.');
            inputName.focus();
            return;
        }

        currentWizardStep = stepNumber;

        // Toggle step panels
        const panels = [wizardStep1, wizardStep2, wizardStep3];
        panels.forEach((panel, idx) => {
            if (!panel) return;
            if (idx + 1 === stepNumber) {
                panel.classList.remove('hidden');
                panel.style.removeProperty('display');
            } else {
                panel.classList.add('hidden');
                panel.style.setProperty('display', 'none', 'important');
            }
        });

        // Wireframe Bottom Navigation Visibility (<, o o o, >)
        if (btnBottomPrev) {
            if (stepNumber === 1) {
                btnBottomPrev.classList.add('invisible');
            } else {
                btnBottomPrev.classList.remove('invisible');
            }
        }

        // On screen 1, only show side arrow if an option has been chosen; on screen 2 & 3, keep visible
        if (btnBottomNext) {
            if (stepNumber === 1) {
                if (roleChosen) {
                    btnBottomNext.classList.remove('fade-hidden');
                    btnBottomNext.classList.add('fade-visible');
                } else {
                    btnBottomNext.classList.add('fade-hidden');
                    btnBottomNext.classList.remove('fade-visible');
                }
            } else {
                btnBottomNext.classList.remove('fade-hidden');
                btnBottomNext.classList.add('fade-visible');
            }
        }

        // Update minimalist bottom dots
        const dots = document.querySelectorAll('.wizard-dot');
        if (dots && dots.length > 0) {
            dots.forEach((dot) => {
                const step = parseInt(dot.dataset.step, 10);
                if (step === stepNumber) {
                    dot.classList.add('active');
                    dot.classList.remove('completed');
                } else if (step < stepNumber) {
                    dot.classList.remove('active');
                    dot.classList.add('completed');
                } else {
                    dot.classList.remove('active');
                    dot.classList.remove('completed');
                }
            });
        }

        updateProfilePreview();
    }

    // Wireframe Bottom Navigation Handlers (<, >)
    if (btnBottomPrev) {
        btnBottomPrev.addEventListener('click', () => {
            requestAppFullscreen();
            if (currentWizardStep > 1) {
                goToWizardStep(currentWizardStep - 1);
            }
        });
    }

    if (btnBottomNext) {
        btnBottomNext.addEventListener('click', () => {
            requestAppFullscreen();
            if (currentWizardStep === 1) {
                goToWizardStep(2);
            } else if (currentWizardStep === 2) {
                goToWizardStep(3);
            } else if (currentWizardStep === 3) {
                startUserSession();
            }
        });
    }

    // Bottom Dots Direct Click
    const allDots = document.querySelectorAll('.wizard-dot');
    if (allDots && allDots.length > 0) {
        allDots.forEach((dot) => {
            dot.addEventListener('click', () => {
                const step = parseInt(dot.dataset.step, 10);
                if (step === 1 || step === 2 || (inputName.value && inputName.value.trim())) {
                    goToWizardStep(step);
                }
            });
        });
    }

    // Race Day Pills Event Handlers (Saturday vs Sunday)
    if (raceDayPills && raceDayPills.length > 0) {
        raceDayPills.forEach((pill) => {
            pill.addEventListener('click', () => {
                requestAppFullscreen();
                raceDayPills.forEach((p) => p.classList.remove('active'));
                pill.classList.add('active');
                const room = pill.dataset.room;
                if (room) {
                    state.roomId = room;
                    localStorage.setItem('cr_room_id', room);
                    if (roomBadge) roomBadge.textContent = room;
                    if (passRoomPill) passRoomPill.textContent = room;
                    if (screen3RoomTag) screen3RoomTag.textContent = room;
                }
            });
        });
    }

    // Radar / Mug Drawer Toggle Handler
    if (btnTriggerAvatarDrawer && avatarCustomiseDrawer) {
        btnTriggerAvatarDrawer.addEventListener('click', () => {
            const isHidden = avatarCustomiseDrawer.classList.contains('hidden');
            if (isHidden) {
                avatarCustomiseDrawer.classList.remove('hidden');
                avatarCustomiseDrawer.style.removeProperty('display');
            } else {
                avatarCustomiseDrawer.classList.add('hidden');
                avatarCustomiseDrawer.style.setProperty('display', 'none', 'important');
            }
        });
    }

    function renderAvatarElement(element, user) {
        if (!element) return;
        if (user.avatarType === 'photo' && user.avatarValue) {
            element.innerHTML = `<img src="${user.avatarValue}" alt="${user.name}">`;
            element.style.background = '#182030';
            element.style.borderColor = 'rgba(255, 255, 255, 0.2)';
        } else if (user.avatarType === 'emoji' && user.avatarValue) {
            element.textContent = user.avatarValue;
            element.style.background = '#182030';
            element.style.borderColor = 'rgba(255, 255, 255, 0.2)';
            element.style.color = '#ffffff';
        } else {
            element.textContent = user.avatarValue || calculateInitials(user.name);
            const isWhite = (user.avatarColor === '#ffffff' || user.avatarColor === '#fff');
            const col = user.avatarColor || '#ee2737';
            element.style.background = col;
            element.style.borderColor = isWhite ? '#cbd5e1' : '#ffffff';
            element.style.color = isWhite ? '#0b0e14' : '#ffffff';
        }
    }

    inputName.addEventListener('input', () => {
        if (state.user.avatarType === 'initials') {
            updateProfilePreview();
        } else {
            previewDisplayName.textContent = inputName.value.trim() || 'Runner Name';
        }
    });

    // ==========================================
    // Random Punchlines & Role Selection (Runner vs Cheer)
    // ==========================================
    const RUNNER_PUNCHLINES = [
        "Full gas mate, leave it all on the track.",
        "Dig deep — every second counts today.",
        "Legs feeling strong, lock in your pace.",
        "Head down, breathing steady, chase that PB.",
        "Trust the training, the finish line is waiting.",
        "Pure focus, smooth cadence, run with heart.",
        "Melbourne's roads are yours today.",
        "Find your rhythm and let the legs do the work.",
        "One kilometre at a time, unstoppable.",
        "Breathe in belief, breathe out the fatigue.",
        "Nothing can stop you now, keep pressing.",
        "Push the pace, the crowds are backing you.",
        "This is where hard work turns into glory.",
        "Strong mind, fast legs, pure determination.",
        "Squeeze every drop of energy out of today.",
        "Run your race, own every single stride.",
        "The pain is temporary, the PB is forever.",
        "Feel the roar of the Melbourne crowd.",
        "Heart rate high, spirits higher.",
        "Stay tall, keep the turnover fast.",
        "Every mile brings you closer to legendary.",
        "No limits today — go chase your best.",
        "Float on the bitumen, crush the distance.",
        "Embrace the burn, you were built for this.",
        "Finishing strong inside the MCG!"
    ];

    const CHEER_PUNCHLINES = [
        "Loud and proud — backing our champions all the way!",
        "Zero voice left by the finish line!",
        "Every step cheered, maximum hype on course!",
        "Signs up high, high-fives ready!",
        "The louder we yell, the faster they run!",
        "Bringing electric energy to Melbourne's streets!",
        "Fuelling our runners with pure belief and cheers!",
        "Standing by our athletes through every single kilometre!",
        "Cheering with all our heart and lungs today!",
        "You run, we roar — perfect teamwork!",
        "Melbourne Marathon vibes at maximum volume!",
        "Spotted our legends on course — let's go!",
        "Sending unstoppable power directly to their legs!",
        "Every runner deserves a hero's welcome!",
        "Making noise that echoes all the way to the MCG!",
        "Cowbells ringing, hands clapping, voices soaring!",
        "Cheering them past the wall and onto glory!",
        "Melbourne's best cheer crew is right here!",
        "Giving every runner an extra burst of speed!",
        "Big cheers, huge smiles, pure race-day hype!",
        "Cheering loud enough to drop their splits!",
        "No runner left without a thunderous cheer today!",
        "Here to turn fatigue into pure adrenaline!",
        "Ready at the barrier with unconditional love and noise!",
        "Melbourne pride on full display — cheer them home!"
    ];

    function setRole(role) {
        roleChosen = true;
        state.user.role = role;
        localStorage.setItem('cr_user_role', role);

        if (role === 'runner') {
            if (btnChoiceRunner) btnChoiceRunner.classList.add('active');
            if (btnChoiceCheer) btnChoiceCheer.classList.remove('active');
            const quote = RUNNER_PUNCHLINES[Math.floor(Math.random() * RUNNER_PUNCHLINES.length)];
            if (rolePunchlineText) rolePunchlineText.textContent = quote;

            // Roster dropdown enabled for runners
            if (btnToggleNameDropdown) btnToggleNameDropdown.style.display = 'flex';
            if (inputName) inputName.placeholder = 'Type or select athlete...';
        } else {
            if (btnChoiceCheer) btnChoiceCheer.classList.add('active');
            if (btnChoiceRunner) btnChoiceRunner.classList.remove('active');
            const quote = CHEER_PUNCHLINES[Math.floor(Math.random() * CHEER_PUNCHLINES.length)];
            if (rolePunchlineText) rolePunchlineText.textContent = quote;

            // Roster dropdown hidden for cheer squad
            if (btnToggleNameDropdown) btnToggleNameDropdown.style.display = 'none';
            hideNameDropdown();
            if (inputName) inputName.placeholder = 'Your Name (Cheer Squad)';

            // Festive celebratory confetti burst upon selecting Cheer Squad
            triggerCelebrationConfetti(35);
        }

        if (rolePunchline) {
            rolePunchline.classList.add('visible');
            rolePunchline.classList.remove('hidden');
        }
        if (btnBottomNext) {
            btnBottomNext.classList.remove('fade-hidden');
            btnBottomNext.classList.add('fade-visible');
        }
        updateProfilePreview();
    }

    if (btnChoiceRunner) btnChoiceRunner.addEventListener('click', () => {
        requestAppFullscreen();
        setRole('runner');
    });
    if (btnChoiceCheer) btnChoiceCheer.addEventListener('click', () => {
        requestAppFullscreen();
        setRole('cheer');
    });

    // ==========================================
    // Screen 3: VIP Segmented Control & Dynamic Trays (Nike / Apple Elite)
    // ==========================================
    const passSegBtns = document.querySelectorAll('.pass-seg-btn');
    const trayInitials = document.getElementById('tray-initials');
    const trayEmoji = document.getElementById('tray-emoji');
    const trayPhoto = document.getElementById('tray-photo');
    const passHeroAura = document.getElementById('pass-hero-aura');
    const passHeroTrigger = document.getElementById('pass-hero-avatar-trigger');
    const btnHeroCamShortcut = document.getElementById('btn-hero-cam-shortcut');

    const HYPE_EMOJIS = ['🏃', '🏃‍♀️', '⚡', '🔥', '🦁', '😎', '🚀', '👑', '🥇', '🏆', '🎯', '🐺', '💪', '👟', '🦾', '🌪️', '✨', '🦊', '🦅'];

    function switchAvatarMode(tab, autoRandom = false) {
        state.user.avatarType = tab;
        passSegBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });

        if (trayInitials) {
            trayInitials.classList.toggle('hidden', tab !== 'initials');
            trayInitials.style.setProperty('display', tab === 'initials' ? 'flex' : 'none', 'important');
        }
        if (trayEmoji) {
            trayEmoji.classList.toggle('hidden', tab !== 'emoji');
            trayEmoji.style.setProperty('display', tab === 'emoji' ? 'flex' : 'none', 'important');
        }
        if (trayPhoto) {
            trayPhoto.classList.toggle('hidden', tab !== 'photo');
            trayPhoto.style.setProperty('display', tab === 'photo' ? 'flex' : 'none', 'important');
        }

        if (tab === 'initials') {
            const name = (inputName && inputName.value ? inputName.value.trim() : '') || state.user.name;
            state.user.avatarValue = calculateInitials(name);
        } else if (tab === 'emoji') {
            if (autoRandom || !state.user.avatarValue || state.user.avatarValue.length > 2) {
                state.user.avatarValue = HYPE_EMOJIS[Math.floor(Math.random() * HYPE_EMOJIS.length)];
            }
        }

        // Tactile micro-bounce animation on circle
        if (previewAvatarBadge) {
            previewAvatarBadge.style.transform = 'scale(1.08)';
            setTimeout(() => {
                if (previewAvatarBadge) previewAvatarBadge.style.transform = '';
            }, 180);
        }

        updateProfilePreview();
    }

    passSegBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            switchAvatarMode(btn.dataset.tab, true);
        });
    });

    // Neon Colour Gems Selection
    const neonGems = document.querySelectorAll('.btn-neon-gem');
    neonGems.forEach((gem) => {
        gem.addEventListener('click', (e) => {
            e.stopPropagation();
            neonGems.forEach((g) => g.classList.remove('active'));
            gem.classList.add('active');
            const color = gem.dataset.color;
            state.user.avatarColor = color;
            state.user.avatarType = 'initials';
            if (passHeroAura) {
                passHeroAura.style.background = `radial-gradient(circle, ${color}66 0%, ${color}00 70%)`;
            }
            updateProfilePreview();
        });
    });

    // Hype Emojis Pick & Shuffle
    const hypeEmojiButtons = document.querySelectorAll('.btn-hype-emoji');
    hypeEmojiButtons.forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            hypeEmojiButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.user.avatarType = 'emoji';
            state.user.avatarValue = btn.dataset.emoji;
            updateProfilePreview();
        });
    });

    const btnShuffleEmoji = document.getElementById('btn-shuffle-emoji');
    if (btnShuffleEmoji) {
        btnShuffleEmoji.addEventListener('click', (e) => {
            e.stopPropagation();
            const randomEmoji = HYPE_EMOJIS[Math.floor(Math.random() * HYPE_EMOJIS.length)];
            state.user.avatarType = 'emoji';
            state.user.avatarValue = randomEmoji;
            updateProfilePreview();
        });
    }

    // Direct Avatar Tap Trigger (Opens Camera/Photo picker if in Photo mode or tap cam shortcut)
    if (passHeroTrigger) {
        passHeroTrigger.addEventListener('click', () => {
            if (state.user.avatarType === 'photo') {
                if (inputAvatarFile) inputAvatarFile.click();
            } else {
                // If on initials or emoji, tap cycles to next mode smoothly
                const nextTab = state.user.avatarType === 'initials' ? 'emoji' : (state.user.avatarType === 'emoji' ? 'photo' : 'initials');
                switchAvatarMode(nextTab, true);
            }
        });
    }

    if (btnHeroCamShortcut) {
        btnHeroCamShortcut.addEventListener('click', (e) => {
            e.stopPropagation();
            switchAvatarMode('photo');
            if (inputAvatarFile) inputAvatarFile.click();
        });
    }

    // Photo File Upload Reader
    if (inputAvatarFile) {
        inputAvatarFile.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const size = 160;
                    canvas.width = size;
                    canvas.height = size;
                    const ctx = canvas.getContext('2d');
                    
                    const minSide = Math.min(img.width, img.height);
                    const startX = (img.width - minSide) / 2;
                    const startY = (img.height - minSide) / 2;
                    ctx.drawImage(img, startX, startY, minSide, minSide, 0, 0, size, size);

                    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
                    state.user.avatarType = 'photo';
                    state.user.avatarValue = dataUrl;
                    if (avatarPhotoOverlay) {
                        avatarPhotoOverlay.classList.add('hidden');
                        avatarPhotoOverlay.style.setProperty('display', 'none', 'important');
                    }
                    updateProfilePreview();
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    headerUserAvatar.addEventListener('click', () => {
        joinModal.classList.remove('hidden');
        joinModal.style.removeProperty('display');
        syncAvatarColorDots();
        updateProfilePreview();
        goToWizardStep(3);
    });

    // ==========================================
    // Parse URL params for QR Code Auto-Login & Room Links
    // ==========================================
    const urlParams = new URLSearchParams(window.location.search);
    let isQrLogin = false;

    const targetUserId = urlParams.get('u') || urlParams.get('user');
    const targetRoom = urlParams.get('room');
    const targetRole = urlParams.get('role');
    const targetName = urlParams.get('name');

    if (targetRoom) {
        state.roomId = targetRoom.toUpperCase();
        localStorage.setItem('cr_room_id', state.roomId);
    }
    if (targetRole) {
        setRole(targetRole === 'cheer' ? 'cheer' : 'runner');
    }

    function showQrWelcomeGreeting(name, room) {
        if (!qrWelcomeBanner) return;
        qrWelcomeBanner.classList.remove('hidden');
        qrWelcomeBanner.style.removeProperty('display');
        if (qrBannerGreeting) {
            qrBannerGreeting.textContent = `G'day ${name}!`;
        }
        if (qrBannerMessage) {
            qrBannerMessage.innerHTML = `Your race room is <strong>${room}</strong>. Choose an avatar or take a photo to receive cheers along the course!`;
        }
        // Jump directly to Step 3 (Avatar / Photo)
        goToWizardStep(3);
        joinModal.classList.remove('hidden');
        joinModal.style.removeProperty('display');
    }

    if (targetUserId) {
        isQrLogin = true;
        fetch('/api/users')
            .then(res => res.json())
            .then(users => {
                const found = users.find(u => u.id === targetUserId);
                if (found) {
                    state.user.id = found.id;
                    state.user.name = found.name;
                    state.user.role = found.role || 'runner';
                    state.user.avatarType = found.avatarType || 'initials';
                    state.user.avatarValue = found.avatarValue || calculateInitials(found.name);
                    state.user.avatarColor = found.avatarColor || '#ee2737';
                    if (found.defaultRoom && !targetRoom) {
                        state.roomId = found.defaultRoom;
                        localStorage.setItem('cr_room_id', state.roomId);
                    }
                    inputName.value = found.name;
                    setRole(state.user.role);
                    updateProfilePreview();
                    showQrWelcomeGreeting(found.name, state.roomId);
                }
            })
            .catch(err => console.warn('Could not load user for QR login:', err));
    } else if (targetName) {
        isQrLogin = true;
        state.user.name = targetName;
        inputName.value = targetName;
        if (targetRole) setRole(targetRole);
        updateProfilePreview();
        showQrWelcomeGreeting(targetName, state.roomId);
    }

    if (state.user.name && !isQrLogin) {
        inputName.value = state.user.name;
    }
    if (roomBadge) roomBadge.textContent = formatRoomShort(state.roomId);
    syncAvatarColorDots();
    updateProfilePreview();
    loadRoomsFromApi();

    // Initialize Map immediately so it is NEVER blank or missing
    mapManager.init();
    mapManager.loadRoomCourses(state.roomId);
    window.addEventListener('resize', () => {
        if (mapManager && mapManager.map) {
            mapManager.map.invalidateSize();
        }
    });

    const mapContainerEl = document.getElementById('map');
    if (mapContainerEl) {
        mapContainerEl.addEventListener('click', () => {
            requestAppFullscreen();
        });
    }

    // Connect click-to-target on map markers (toggle: click to target, click again to reset to 'all')
    mapManager.onMarkerClick = (targetUser) => {
        if (!targetUser || targetUser.id === state.user.id || (targetUser.name && state.user.name && targetUser.name.trim().toLowerCase() === state.user.name.trim().toLowerCase())) {
            return; // Ignore clicking on own marker
        }
        if (state.selectedTargetUserId === targetUser.id) {
            selectRecipient('all');
            return;
        }
        selectRecipient(targetUser.id);
        showReactionToast({
            reaction: 'horn',
            sender: { name: `Targeted: ${targetUser.name}` }
        });
    };

    // If user previously registered and not a QR code invitation, close modal and connect automatically
    if (!isQrLogin && state.user.name && state.user.name.trim()) {
        joinModal.classList.add('hidden');
        joinModal.style.setProperty('display', 'none', 'important');
        connectWebSocket();
        locationManager.startTracking();
        mediaSessionManager.initMediaSession();
        mediaSessionManager.requestWakeLock();
        setTimeout(() => {
            if (mapManager && mapManager.map) mapManager.map.invalidateSize();
        }, 200);
    } else if (!isQrLogin) {
        goToWizardStep(1);
    }

    // Start Session Controller
    function startUserSession() {
        const enteredName = inputName.value.trim();
        if (!enteredName) {
            alert('Please enter your name or choose an athlete from the roster.');
            goToWizardStep(2);
            inputName.focus();
            return;
        }

        state.user.name = enteredName;

        if (state.user.avatarType === 'initials') {
            state.user.avatarValue = calculateInitials(enteredName);
        }

        localStorage.setItem('cr_name', enteredName);
        localStorage.setItem('cr_role', state.user.role);
        localStorage.setItem('cr_room_id', state.roomId);
        localStorage.setItem('cr_avatar_type', state.user.avatarType);
        localStorage.setItem('cr_avatar_value', state.user.avatarValue);
        localStorage.setItem('cr_avatar_color', state.user.avatarColor);

        joinModal.classList.add('hidden');
        joinModal.style.setProperty('display', 'none', 'important');
        if (roomBadge) roomBadge.textContent = formatRoomShort(state.roomId);
        updateProfilePreview();

        // Ensure Map is ready and properly sized
        mapManager.init();
        setTimeout(() => {
            if (mapManager && mapManager.map) mapManager.map.invalidateSize();
        }, 150);

        // Connect WebSocket if not yet connected, or sync updated user profile if already open
        if (!state.isConnected) {
            connectWebSocket();
        } else if (state.ws && state.ws.readyState === WebSocket.OPEN) {
            state.ws.send(JSON.stringify({
                type: 'join',
                roomId: state.roomId,
                user: state.user
            }));
        }

        // Start GPS automatically upon login
        locationManager.startTracking();

        // Initialize Bluetooth headset buttons & WakeLock
        mediaSessionManager.initMediaSession();
        mediaSessionManager.requestWakeLock();

        // Attempt full-screen mode on user gesture
        const doc = document.documentElement;
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
            if (doc.requestFullscreen) {
                doc.requestFullscreen().catch(() => {});
            } else if (doc.webkitRequestFullscreen) {
                doc.webkitRequestFullscreen();
            }
        }
    }

    if (btnStart) {
        btnStart.addEventListener('click', startUserSession);
    }

    // Recenter map button
    btnRecenter.addEventListener('click', () => {
        if (state.user.role === 'runner' && locationManager.currentLocation) {
            mapManager.centerOn(locationManager.currentLocation.lat, locationManager.currentLocation.lng);
        } else if (state.activeRunnerId && state.users.has(state.activeRunnerId)) {
            const runner = state.users.get(state.activeRunnerId);
            if (runner.location) {
                mapManager.centerOn(runner.location.lat, runner.location.lng);
            }
        }
    });

    // ==========================================
    // Course Distance Selector Dial (Below Recenter - Race Flag Icon)
    // ==========================================
    const btnToggleCourses = document.getElementById('btn-toggle-courses');
    const courseDialOptions = document.getElementById('course-dial-options');
    const dialChoiceBtns = document.querySelectorAll('.btn-dial-choice');

    function syncCourseDialState() {
        if (!mapManager || !dialChoiceBtns.length) return;
        dialChoiceBtns.forEach((btn) => {
            const courseId = btn.dataset.course;
            const isVis = mapManager.isCourseVisible(courseId);
            btn.classList.toggle('active', isVis);
        });
    }

    if (btnToggleCourses && courseDialOptions) {
        btnToggleCourses.addEventListener('click', (e) => {
            e.stopPropagation();
            const isHidden = courseDialOptions.classList.contains('hidden');
            if (isHidden) {
                courseDialOptions.classList.remove('hidden');
                btnToggleCourses.classList.add('active');
                syncCourseDialState();
            } else {
                courseDialOptions.classList.add('hidden');
                btnToggleCourses.classList.remove('active');
            }
        });

        // Close dial when tapping outside on the map or body
        document.addEventListener('click', (e) => {
            if (!courseDialOptions.classList.contains('hidden')) {
                if (!e.target.closest('#course-selector-dial')) {
                    courseDialOptions.classList.add('hidden');
                    btnToggleCourses.classList.remove('active');
                }
            }
        });

        // Mini Circle Buttons: multi-select independent course toggles
        dialChoiceBtns.forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const courseId = btn.dataset.course;
                const wasActive = btn.classList.contains('active');
                const willBeActive = !wasActive;
                btn.classList.toggle('active', willBeActive);

                // Dynamically toggle course line in Leaflet
                mapManager.toggleCourseVisibility(courseId, willBeActive);
            });
        });
    }

    // Connect mapManager course loaded callback
    mapManager.onCoursesLoaded = () => {
        syncCourseDialState();
    };
    syncCourseDialState();

    // Simulation toggle button (helpful for testing on PC)
    let isSimulating = false;
    let simCompanion = null;
    btnToggleSim.addEventListener('click', () => {
        isSimulating = !isSimulating;
        if (isSimulating) {
            locationManager.startSimulation();
            btnToggleSim.classList.add('active');
            btnToggleSim.title = 'GPS Simulation: ON (Click to turn OFF)';

            // Spawn virtual companion Coach Sarah at Pakenham Lakeside for solo 1-to-1 testing
            if (!state.users.has('sim_coach')) {
                simCompanion = {
                    id: 'sim_coach',
                    name: 'Coach Sarah',
                    role: 'cheer',
                    avatarType: 'emoji',
                    avatarValue: '📣',
                    avatarColor: '#ff007f',
                    location: {
                        lat: -38.0725,
                        lng: 145.4880,
                        pace: 'Cheering',
                        speed: '0.0',
                        distance: '0.00'
                    }
                };
                state.users.set('sim_coach', simCompanion);
                mapManager.updateUserMarker(simCompanion, simCompanion.location);
                updateRecipientChips();
                usersCountEl.textContent = `${state.users.size + 1} Active`;
            }
        } else {
            locationManager.stopTracking();
            locationManager.startTracking();
            btnToggleSim.classList.remove('active');
            btnToggleSim.title = 'GPS Simulation: OFF (Click to turn ON)';

            // Remove simulated companion if active
            if (state.users.has('sim_coach')) {
                mapManager.removeUserMarker('sim_coach');
                state.users.delete('sim_coach');
                if (state.selectedTargetUserId === 'sim_coach') {
                    selectRecipient('all');
                }
                updateRecipientChips();
                usersCountEl.textContent = `${state.users.size + 1} Active`;
            }
        }
    });

    // Share room button
    btnShareRoom.addEventListener('click', () => {
        const shareUrl = `${window.location.origin}/?room=${encodeURIComponent(state.roomId)}&role=cheer`;
        navigator.clipboard.writeText(shareUrl).then(() => {
            alert(`Cheer Squad Invite Link for [${state.roomId}] copied to clipboard!\n\n${shareUrl}`);
        }).catch(() => {
            prompt('Copy this invite link for your cheer squad:', shareUrl);
        });
    });

    // Runner HUD Mode Toggle
    btnToggleHud.addEventListener('click', () => {
        hudModal.classList.remove('hidden');
        hudModal.style.removeProperty('display');
    });
    btnCloseHud.addEventListener('click', () => {
        hudModal.classList.add('hidden');
        hudModal.style.setProperty('display', 'none', 'important');
    });

    // Full-Screen Mode Toggle (Cross-platform with iOS PWA advice)
    const btnToggleFullscreen = document.getElementById('btn-toggle-fullscreen');
    const iconFsEnter = document.getElementById('icon-fs-enter');
    const iconFsExit = document.getElementById('icon-fs-exit');

    function toggleAppFullscreen() {
        const doc = document.documentElement;
        const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
        if (!isFs) {
            if (doc.requestFullscreen) {
                doc.requestFullscreen().catch(() => {});
            } else if (doc.webkitRequestFullscreen) {
                doc.webkitRequestFullscreen();
            } else {
                showToastNotification('💡 For true 100% full screen on iOS, tap Share and "Add to Home Screen"');
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen().catch(() => {});
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            }
        }
    }

    if (btnToggleFullscreen) {
        btnToggleFullscreen.addEventListener('click', toggleAppFullscreen);
        const updateFsIcons = () => {
            const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
            if (iconFsEnter) iconFsEnter.style.display = isFs ? 'none' : 'block';
            if (iconFsExit) iconFsExit.style.setProperty('display', isFs ? 'block' : 'none', 'important');
            btnToggleFullscreen.classList.toggle('active', isFs);
        };
        document.addEventListener('fullscreenchange', updateFsIcons);
        document.addEventListener('webkitfullscreenchange', updateFsIcons);
    }

    // Hands-Free Bluetooth Earphone Button integration
    mediaSessionManager.onHardwareButtonPressed = () => {
        if (audioManager.isRecording) {
            audioManager.stopRecording();
        } else if (audioManager.lastRecordedAudio) {
            sendReviewedAudio();
        } else {
            audioManager.startRecording();
        }
    };

    // ==========================================
    // Recipient Selector Logic
    // ==========================================
    function updateRecipientChips() {
        const currentTarget = state.selectedTargetUserId;
        recipientChipsList.innerHTML = '';

        // 1. ALL (Broadcast)
        const allBtn = document.createElement('button');
        allBtn.className = `recipient-chip ${currentTarget === 'all' ? 'active' : ''}`;
        allBtn.dataset.target = 'all';
        allBtn.innerHTML = `<span>📢 ALL</span>`;
        allBtn.addEventListener('click', () => selectRecipient('all'));
        recipientChipsList.appendChild(allBtn);

        // Count runners and cheers in room
        let runnersCount = 0;
        let cheerCount = 0;
        state.users.forEach((u) => {
            if (u.role === 'runner') runnersCount++;
            else cheerCount++;
        });

        // 2. Sub-group: All Runners (if runners present)
        if (runnersCount > 0) {
            const runnersBtn = document.createElement('button');
            runnersBtn.className = `recipient-chip ${currentTarget === 'runners' ? 'active' : ''}`;
            runnersBtn.dataset.target = 'runners';
            runnersBtn.innerHTML = `<span>🏃 Runners (${runnersCount})</span>`;
            runnersBtn.addEventListener('click', () => selectRecipient('runners'));
            recipientChipsList.appendChild(runnersBtn);
        }

        // 3. Sub-group: Cheer Squad (if supporters present)
        if (cheerCount > 0) {
            const cheerBtn = document.createElement('button');
            cheerBtn.className = `recipient-chip ${currentTarget === 'cheer' ? 'active' : ''}`;
            cheerBtn.dataset.target = 'cheer';
            cheerBtn.innerHTML = `<span>📣 Cheer (${cheerCount})</span>`;
            cheerBtn.addEventListener('click', () => selectRecipient('cheer'));
            recipientChipsList.appendChild(cheerBtn);
        }

        // 4. Individual teammates (1-to-1 direct messaging, exclude self - first name only to save space)
        state.users.forEach((user) => {
            if (user.id === state.user.id || (user.name && state.user.name && user.name.trim().toLowerCase() === state.user.name.trim().toLowerCase())) {
                return; // Do not allow targeting oneself
            }
            const btn = document.createElement('button');
            const isTarget = (currentTarget === user.id);
            btn.className = `recipient-chip chip-direct ${isTarget ? 'active' : ''}`;
            btn.dataset.target = user.id;

            let avatarMiniHtml = '';
            if (user.avatarType === 'photo' && user.avatarValue) {
                avatarMiniHtml = `<span class="chip-avatar-mini"><img src="${user.avatarValue}" alt="${user.name}"></span>`;
            } else if (user.avatarType === 'emoji' && user.avatarValue) {
                avatarMiniHtml = `<span>${user.avatarValue}</span>`;
            } else if (user.avatarType === 'initials' && user.avatarValue) {
                avatarMiniHtml = `<span class="chip-avatar-mini" style="background:${user.avatarColor || '#00f2fe'}; color:#041018;">${user.avatarValue}</span>`;
            } else {
                avatarMiniHtml = `<span>${user.role === 'runner' ? '🏃' : '📣'}</span>`;
            }

            const firstName = (user.name || '').trim().split(/\s+/)[0] || 'Runner';
            btn.innerHTML = `${avatarMiniHtml}<span>${firstName}</span>`;
            btn.title = user.name;
            btn.addEventListener('click', () => selectRecipient(user.id));
            recipientChipsList.appendChild(btn);
        });

        updateSendButtonLabel();
    }

    function selectRecipient(targetId) {
        state.selectedTargetUserId = targetId;
        mapManager.setTargetedUser(targetId);
        document.querySelectorAll('.recipient-chip').forEach((chip) => {
            chip.classList.toggle('active', chip.dataset.target === targetId);
        });
        updateSendButtonLabel();
    }

    function updateSendButtonLabel() {
        if (state.selectedTargetUserId === 'all') {
            btnReviewSendLabel.textContent = 'Send to ALL';
        } else if (state.selectedTargetUserId === 'runners') {
            btnReviewSendLabel.textContent = 'Send to Runners';
        } else if (state.selectedTargetUserId === 'cheer') {
            btnReviewSendLabel.textContent = 'Send to Cheer';
        } else {
            const targetUser = state.users.get(state.selectedTargetUserId) ||
                               (state.user && state.user.id === state.selectedTargetUserId ? state.user : null);
            const targetFirstName = targetUser ? (targetUser.name || '').trim().split(/\s+/)[0] : '';
            btnReviewSendLabel.textContent = targetFirstName ? `Send to ${targetFirstName}` : 'Send';
        }
    }

    // ==========================================
    // Location Manager Listeners
    // ==========================================
    locationManager.onLocationUpdate = (loc) => {
        if (statPace) statPace.textContent = loc.pace;
        if (statDistance) statDistance.textContent = `${loc.distance} km`;
        if (statSpeed) statSpeed.textContent = `${loc.speed} km/h`;
        if (hudPace) hudPace.textContent = loc.pace;
        if (hudDistance) hudDistance.textContent = `${loc.distance} km`;

        mapManager.updateUserMarker(state.user, loc);

        if (state.ws && state.isConnected) {
            state.ws.send(JSON.stringify({
                type: 'location_update',
                roomId: state.roomId,
                location: loc
            }));
        }

        if (state.user.role === 'cheer' && state.activeRunnerId && state.users.has(state.activeRunnerId)) {
            const runner = state.users.get(state.activeRunnerId);
            if (runner.location) {
                const prox = locationManager.getProximityToTarget(runner.location.lat, runner.location.lng);
                if (prox && statEta) {
                    etaContainer.classList.remove('hidden');
                    etaContainer.style.removeProperty('display');
                    statEta.innerHTML = `<strong>${prox.distanceFormatted}</strong> (ETA: ${prox.etaText})`;
                    mapManager.updateProximityLine([loc.lat, loc.lng], [runner.location.lat, runner.location.lng]);
                }
            }
        }
    };

    // ==========================================
    // Audio Manager Listeners (Walkie-Talkie)
    // ==========================================
    const PTT_CIRCUMFERENCE = 2 * Math.PI * 45; // 282.74

    audioManager.onRecordingStart = () => {
        btnPtt.classList.add('recording');
        if (pttContainer) pttContainer.classList.add('recording');
        btnHudPtt.classList.add('recording');
        if (pttProgressCircle) {
            pttProgressCircle.style.strokeDasharray = `${PTT_CIRCUMFERENCE}`;
            pttProgressCircle.style.strokeDashoffset = `${PTT_CIRCUMFERENCE}`;
        }
        if (pttStatusText) pttStatusText.textContent = '';
        recordingReviewBar.classList.add('hidden');
        recordingReviewBar.style.setProperty('display', 'none', 'important');
    };

    audioManager.onRecordingProgress = (elapsedMs, remainingMs, pct) => {
        const remainingSec = (remainingMs / 1000).toFixed(1);
        pttTimerText.textContent = `${remainingSec}s`;
        if (pttProgressCircle) {
            const offset = PTT_CIRCUMFERENCE * (1 - (pct / 100));
            pttProgressCircle.style.strokeDashoffset = offset.toFixed(2);
        }
    };

    audioManager.onRecordingReadyForReview = (audioData) => {
        btnPtt.classList.remove('recording');
        if (pttContainer) pttContainer.classList.remove('recording');
        btnHudPtt.classList.remove('recording');
        if (pttStatusText) pttStatusText.textContent = '';
        pttTimerText.textContent = '10s';
        if (pttProgressCircle) pttProgressCircle.style.strokeDashoffset = `${PTT_CIRCUMFERENCE}`;

        reviewDurationText.textContent = `${audioData.duration}s recorded`;
        recordingReviewBar.classList.remove('hidden');
        recordingReviewBar.style.removeProperty('display');
        updateSendButtonLabel();
    };

    btnReviewListen.addEventListener('click', () => {
        if (audioManager.isPreviewPlaying) {
            audioManager.stopPreview();
            btnReviewListen.innerHTML = `<span>▶</span><span>Listen</span>`;
        } else {
            btnReviewListen.innerHTML = `<span>⏸</span><span>Pause</span>`;
            audioManager.playPreview(() => {
                btnReviewListen.innerHTML = `<span>▶</span><span>Listen</span>`;
            });
        }
    });

    btnReviewDiscard.addEventListener('click', () => {
        audioManager.discardRecording();
        recordingReviewBar.classList.add('hidden');
        recordingReviewBar.style.setProperty('display', 'none', 'important');
        btnReviewListen.innerHTML = `<span>▶</span><span>Listen</span>`;
    });

    btnReviewSend.addEventListener('click', () => {
        sendReviewedAudio();
    });

    function sendReviewedAudio() {
        const audioData = audioManager.lastRecordedAudio;
        if (!audioData) return;

        // Force stop any preview and tear down audio element
        audioManager.stopPreview();

        const msgId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
        mySentVoiceSignatures.add(msgId);
        if (audioData.base64Audio) {
            mySentVoiceSignatures.add(audioData.base64Audio.substring(0, 100));
        }

        if (state.ws && state.isConnected) {
            state.ws.send(JSON.stringify({
                type: 'audio_message',
                msgId: msgId,
                roomId: state.roomId,
                targetUserId: state.selectedTargetUserId,
                senderId: state.user.id,
                senderName: state.user.name,
                senderRole: state.user.role,
                senderAvatarType: state.user.avatarType,
                senderAvatarValue: state.user.avatarValue,
                senderAvatarColor: state.user.avatarColor,
                audio: audioData.base64Audio,
                duration: audioData.duration
            }));

            addFeedItem({
                senderName: 'You',
                senderRole: state.user.role,
                audio: audioData.base64Audio,
                duration: audioData.duration,
                isOwn: true
            });
        }

        audioManager.discardRecording();
        recordingReviewBar.classList.add('hidden');
        recordingReviewBar.style.setProperty('display', 'none', 'important');
        btnReviewListen.innerHTML = `<span>▶</span><span>Listen</span>`;

        triggerVoiceCooldown();
    }

    function startPtt(e) {
        if (e) e.preventDefault();
        requestAppFullscreen();
        if (isVoiceOnCooldown()) return;
        audioManager.startRecording();
    }
    function stopPtt(e) {
        if (e) e.preventDefault();
        audioManager.stopRecording();
    }

    btnPtt.addEventListener('mousedown', startPtt);
    btnPtt.addEventListener('mouseup', stopPtt);
    btnPtt.addEventListener('touchstart', startPtt, { passive: false });
    btnPtt.addEventListener('touchend', stopPtt, { passive: false });

    btnHudPtt.addEventListener('mousedown', startPtt);
    btnHudPtt.addEventListener('mouseup', stopPtt);
    btnHudPtt.addEventListener('touchstart', startPtt, { passive: false });
    btnHudPtt.addEventListener('touchend', stopPtt, { passive: false });

    // Global release safeguard (so moving cursor off button still stops recording cleanly)
    window.addEventListener('mouseup', () => {
        if (audioManager.isRecording) {
            audioManager.stopRecording();
        }
    });
    window.addEventListener('touchend', () => {
        if (audioManager.isRecording) {
            audioManager.stopRecording();
        }
    });

    window.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && !audioManager.isRecording && !isVoiceOnCooldown() && document.activeElement.tagName !== 'INPUT') {
            e.preventDefault();
            audioManager.startRecording();
        }
    });
    window.addEventListener('keyup', (e) => {
        if (e.code === 'Space' && audioManager.isRecording) {
            e.preventDefault();
            audioManager.stopRecording();
        }
    });

    // ==========================================
    // Festive Celebratory Confetti Burst Effect
    // ==========================================
    function triggerCelebrationConfetti(count = 35) {
        const container = document.getElementById('festive-confetti-container');
        if (!container) return;

        const festiveColors = ['#ee2737', '#ffffff', '#ff9500', '#22c55e', '#38bdf8', '#ffd700'];

        for (let i = 0; i < count; i++) {
            const piece = document.createElement('div');
            piece.className = 'confetti-piece';
            piece.style.left = `${Math.random() * 100}vw`;
            piece.style.top = `${-10 - Math.random() * 20}px`;
            piece.style.backgroundColor = festiveColors[Math.floor(Math.random() * festiveColors.length)];
            piece.style.width = `${6 + Math.random() * 8}px`;
            piece.style.height = `${10 + Math.random() * 12}px`;
            piece.style.animationDuration = `${1.8 + Math.random() * 1.4}s`;
            piece.style.animationDelay = `${Math.random() * 0.3}s`;

            container.appendChild(piece);

            setTimeout(() => {
                piece.remove();
            }, 3500);
        }
    }

    // ==========================================
    // Cooldown Engine (Sounds & Voice Cooldowns)
    // ==========================================
    let CHEER_COOLDOWN_MS = 30000; // default 30s for sound presets
    let VOICE_COOLDOWN_MS = 2000;  // default 2s for walkie-talkie voice
    let cheerCooldownEndTime = 0;
    let voiceCooldownEndTime = 0;
    let cheerCooldownRaf = null;

    async function loadAppConfig() {
        try {
            const res = await fetch('/api/config');
            if (res.ok) {
                const cfg = await res.json();
                applyAppConfig(cfg);
            }
        } catch (e) {
            console.warn('Could not load /api/config, using defaults:', e);
        }
    }

    function applyAppConfig(cfg) {
        if (!cfg) return;
        if (typeof cfg.cheerCooldownSeconds === 'number') {
            CHEER_COOLDOWN_MS = cfg.cheerCooldownSeconds * 1000;
        }
        if (typeof cfg.voiceCooldownSeconds === 'number') {
            VOICE_COOLDOWN_MS = cfg.voiceCooldownSeconds * 1000;
        }
    }

    loadAppConfig();

    const cheerCooldownCircle = document.getElementById('cheer-cooldown-circle');
    const cheerCooldownBadge = document.getElementById('cheer-cooldown-badge');
    const cheerCooldownSec = document.getElementById('cheer-cooldown-sec');
    const RING_CIRCUMFERENCE = 2 * Math.PI * 45; // ~282.74

    function isCheerOnCooldown() {
        return Date.now() < cheerCooldownEndTime;
    }

    function isVoiceOnCooldown() {
        return Date.now() < voiceCooldownEndTime;
    }

    function triggerCheerCooldown() {
        cheerCooldownEndTime = Date.now() + CHEER_COOLDOWN_MS;

        // 1. Lock soundboard buttons
        document.querySelectorAll('.btn-soundboard, .preset-menu-item').forEach((el) => {
            el.classList.add('on-cooldown');
        });

        // 2. Close preset menu if open
        closePresetMenu();

        // 3. Show Fortnite Ability Ring and Badge
        if (pttContainer) pttContainer.classList.add('cheer-charging');
        if (cheerCooldownBadge) {
            cheerCooldownBadge.classList.remove('hidden');
            cheerCooldownBadge.style.removeProperty('display');
            if (cheerCooldownSec) cheerCooldownSec.textContent = `${Math.ceil(CHEER_COOLDOWN_MS / 1000)}s`;
        }
        if (cheerCooldownCircle) {
            cheerCooldownCircle.style.strokeDasharray = `${RING_CIRCUMFERENCE}`;
            cheerCooldownCircle.style.strokeDashoffset = `${RING_CIRCUMFERENCE}`;
        }

        // 4. Start 60fps filling animation loop
        if (cheerCooldownRaf) cancelAnimationFrame(cheerCooldownRaf);

        function updateCheerCooldown() {
            const now = Date.now();
            const remainingMs = cheerCooldownEndTime - now;

            if (remainingMs <= 0) {
                // Cooldown Finished!
                cheerCooldownEndTime = 0;
                if (pttContainer) {
                    pttContainer.classList.remove('cheer-charging');
                    pttContainer.classList.add('cooldown-ready-burst');
                    setTimeout(() => pttContainer.classList.remove('cooldown-ready-burst'), 650);
                }
                if (cheerCooldownBadge) {
                    cheerCooldownBadge.classList.add('hidden');
                    cheerCooldownBadge.style.setProperty('display', 'none', 'important');
                }
                if (cheerCooldownCircle) {
                    cheerCooldownCircle.style.strokeDashoffset = `${RING_CIRCUMFERENCE}`;
                }
                document.querySelectorAll('.btn-soundboard, .preset-menu-item').forEach((el) => {
                    el.classList.remove('on-cooldown');
                });
                return;
            }

            // Fill clockwise from 0% to 100%
            const elapsedMs = CHEER_COOLDOWN_MS - remainingMs;
            const progress = Math.min(1, Math.max(0, elapsedMs / CHEER_COOLDOWN_MS));
            const offset = RING_CIRCUMFERENCE * (1 - progress);

            if (cheerCooldownCircle) {
                cheerCooldownCircle.style.strokeDashoffset = offset.toFixed(2);
            }

            const remSec = Math.ceil(remainingMs / 1000);
            if (cheerCooldownSec) {
                cheerCooldownSec.textContent = `${remSec}s`;
            }

            cheerCooldownRaf = requestAnimationFrame(updateCheerCooldown);
        }

        cheerCooldownRaf = requestAnimationFrame(updateCheerCooldown);
    }

    function triggerVoiceCooldown() {
        if (VOICE_COOLDOWN_MS <= 0) return;
        voiceCooldownEndTime = Date.now() + VOICE_COOLDOWN_MS;
        if (btnPtt) btnPtt.classList.add('voice-cooldown');
        const durSec = Math.max(1, Math.round(VOICE_COOLDOWN_MS / 1000));
        if (pttTimerText) pttTimerText.textContent = `${durSec}s`;
        setTimeout(() => {
            if (btnPtt) btnPtt.classList.remove('voice-cooldown');
            if (pttTimerText && !audioManager.isRecording) {
                pttTimerText.textContent = '10s';
            }
        }, VOICE_COOLDOWN_MS);
    }

    // Fixed soundboard buttons (Stay Hard, Can Do It, Vamo Porra)
    document.querySelectorAll('.btn-soundboard:not(#btn-preset-menu)').forEach((btn) => {
        btn.addEventListener('click', () => {
            if (isCheerOnCooldown()) return;
            const reaction = btn.dataset.sound;
            audioManager.playCheerSound(reaction);
            triggerCelebrationConfetti(28);

            if (state.ws && state.isConnected) {
                state.ws.send(JSON.stringify({
                    type: 'quick_reaction',
                    roomId: state.roomId,
                    targetUserId: state.selectedTargetUserId,
                    senderName: state.user.name,
                    senderRole: state.user.role,
                    reaction
                }));
            }

            triggerCheerCooldown();
        });
    });

    // Preset Dropdown Menu Logic (4th Soundboard Button)
    const btnPresetMenu = document.getElementById('btn-preset-menu');
    const presetPopover = document.getElementById('preset-menu-popover');
    const presetDropdownContainer = document.querySelector('.preset-dropdown-container');
    const presetActiveTitle = document.getElementById('preset-active-title');
    const presetActiveIcon = document.getElementById('preset-active-icon');

    function togglePresetMenu(e) {
        if (e) e.stopPropagation();
        if (isCheerOnCooldown()) return;
        if (!presetPopover) return;
        const isHidden = presetPopover.classList.contains('hidden') || presetPopover.style.display === 'none';
        if (isHidden) {
            presetPopover.classList.remove('hidden');
            presetPopover.style.removeProperty('display');
            if (presetDropdownContainer) presetDropdownContainer.classList.add('menu-open');
        } else {
            closePresetMenu();
        }
    }

    function closePresetMenu() {
        if (!presetPopover) return;
        presetPopover.classList.add('hidden');
        presetPopover.style.setProperty('display', 'none', 'important');
        if (presetDropdownContainer) presetDropdownContainer.classList.remove('menu-open');
    }

    if (btnPresetMenu) {
        btnPresetMenu.addEventListener('click', togglePresetMenu);
    }

    // Preset menu items selection
    document.querySelectorAll('.preset-menu-item').forEach((item) => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            if (isCheerOnCooldown()) return;
            const sound = item.dataset.sound;
            const title = item.dataset.title;
            const emoji = item.querySelector('.preset-item-emoji')?.textContent || '⚡';

            // 1. Play sound locally
            audioManager.playCheerSound(sound);
            triggerCelebrationConfetti(28);

            // 2. Broadcast via WebSocket
            if (state.ws && state.isConnected) {
                state.ws.send(JSON.stringify({
                    type: 'quick_reaction',
                    roomId: state.roomId,
                    targetUserId: state.selectedTargetUserId,
                    senderName: state.user.name,
                    senderRole: state.user.role,
                    reaction: sound
                }));
            }

            // 3. Update active button face
            if (btnPresetMenu) {
                btnPresetMenu.dataset.sound = sound;
            }
            if (presetActiveTitle) {
                presetActiveTitle.textContent = title;
            }

            // 4. Update active highlight in menu
            document.querySelectorAll('.preset-menu-item').forEach((m) => m.classList.remove('active'));
            item.classList.add('active');

            // 5. Trigger 30s Cooldown
            triggerCheerCooldown();
        });
    });

    // Close popover when clicking anywhere else
    document.addEventListener('click', (e) => {
        if (presetDropdownContainer && !presetDropdownContainer.contains(e.target)) {
            closePresetMenu();
        }
    });

    // ==========================================
    // WebSocket Client Connection
    // ==========================================
    function connectWebSocket() {
        if (state.ws && (state.ws.readyState === WebSocket.OPEN || state.ws.readyState === WebSocket.CONNECTING)) {
            return; // Socket already open or actively connecting - avoid duplicate connections
        }

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;

        state.ws = new WebSocket(wsUrl);

        state.ws.onopen = () => {
            state.isConnected = true;
            if (connectionStatus) {
                connectionStatus.className = 'connection-antenna-icon online';
                connectionStatus.title = 'Status: Live Online';
            }

            state.ws.send(JSON.stringify({
                type: 'join',
                roomId: state.roomId,
                user: state.user
            }));
        };

        state.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleServerEvent(data);
            } catch (err) {
                console.error('Failed to parse WebSocket message:', err);
            }
        };

        state.ws.onclose = () => {
            state.isConnected = false;
            if (connectionStatus) {
                connectionStatus.className = 'connection-antenna-icon offline';
                connectionStatus.title = 'Status: Offline (Reconnecting...)';
            }
            setTimeout(connectWebSocket, 3000);
        };
    }

    function handleServerEvent(data) {
        switch (data.type) {
            case 'config_snapshot':
            case 'config_updated': {
                applyAppConfig(data.config);
                break;
            }

            case 'room_snapshot': {
                data.users.forEach((u) => {
                    if (u.id !== state.user.id) {
                        state.users.set(u.id, u);
                        if (u.role === 'runner' && !state.activeRunnerId) {
                            state.activeRunnerId = u.id;
                        }
                        if (u.location) {
                            mapManager.updateUserMarker(u, u.location);
                        }
                    }
                });
                usersCountEl.textContent = `${state.users.size + 1} Active`;
                updateRecipientChips();
                break;
            }

            case 'user_joined': {
                state.users.set(data.user.id, data.user);
                usersCountEl.textContent = `${state.users.size + 1} Active`;
                if (data.user.role === 'runner' && !state.activeRunnerId) {
                    state.activeRunnerId = data.user.id;
                }
                updateRecipientChips();
                break;
            }

            case 'location_update': {
                if (state.users.has(data.userId)) {
                    const user = state.users.get(data.userId);
                    user.location = data.location;
                    mapManager.updateUserMarker(user, data.location);

                    if (state.user.role === 'cheer' && user.role === 'runner' && locationManager.currentLocation) {
                        const prox = locationManager.getProximityToTarget(data.location.lat, data.location.lng);
                        if (prox && statEta) {
                            etaContainer.classList.remove('hidden');
                            etaContainer.style.removeProperty('display');
                            statEta.innerHTML = `<strong>${prox.distanceFormatted}</strong> (ETA: ${prox.etaText})`;
                            mapManager.updateProximityLine(
                                [locationManager.currentLocation.lat, locationManager.currentLocation.lng],
                                [data.location.lat, data.location.lng]
                            );
                        }
                    }
                }
                break;
            }

            case 'audio_message': {
                // Safeguard: Never play back voice notes sent by this exact browser tab/device
                const isFromMe = (
                    (data.msgId && mySentVoiceSignatures.has(data.msgId)) ||
                    (data.audio && mySentVoiceSignatures.has(data.audio.substring(0, 100))) ||
                    (data.sender && data.sender.id === state.user.id)
                );

                if (isFromMe) {
                    console.log('[AUDIO] Self-voice message received (ignored to prevent echo duplication).');
                    break;
                }

                audioManager.enqueueIncomingMessage(data);

                addFeedItem({
                    senderName: data.sender.name,
                    senderRole: data.sender.role,
                    audio: data.audio,
                    duration: data.duration,
                    isOwn: false
                });
                break;
            }

            case 'quick_reaction': {
                audioManager.playCheerSound(data.reaction);
                showReactionToast(data);
                triggerCelebrationConfetti(32);
                break;
            }

            case 'admin_announcement': {
                showReactionToast({
                    senderName: data.sender ? data.sender.name : 'Race Director',
                    senderRole: 'admin',
                    reaction: '📣 ' + data.message
                });
                triggerCelebrationConfetti(35);
                break;
            }

            case 'user_kicked': {
                alert(data.message || 'You have been disconnected by the Administrator.');
                window.location.reload();
                break;
            }

            case 'room_closed': {
                alert(data.message || 'The current race room was closed by the Administrator.');
                window.location.reload();
                break;
            }

            case 'user_left': {
                mapManager.removeUserMarker(data.userId);
                state.users.delete(data.userId);
                usersCountEl.textContent = `${state.users.size + 1} Active`;
                if (state.selectedTargetUserId === data.userId) {
                    selectRecipient('all');
                }
                updateRecipientChips();
                break;
            }
        }
    }

    audioManager.onMessagePlaybackStart = (msg) => {
        incomingCheerBanner.classList.remove('hidden');
        incomingCheerBanner.style.removeProperty('display');
        renderAvatarElement(incomingSenderAvatar, msg.sender);
        triggerCelebrationConfetti(40);
        
        const isDirect = msg.targetUserId && msg.targetUserId !== 'all';
        incomingMsgType.textContent = isDirect ? 'Direct Voice Message' : 'Group Cheer Audio';
        incomingSenderName.textContent = `${msg.sender.name} (${msg.sender.role === 'runner' ? 'Runner' : 'Supporter'})`;
    };

    audioManager.onMessagePlaybackEnd = () => {
        setTimeout(() => {
            incomingCheerBanner.classList.add('hidden');
            incomingCheerBanner.style.setProperty('display', 'none', 'important');
        }, 1200);
    };

    audioManager.onAutoplayBlocked = (msg) => {
        if (incomingCheerBanner) {
            incomingCheerBanner.classList.remove('hidden');
            incomingCheerBanner.style.removeProperty('display');
            if (msg.sender) renderAvatarElement(incomingSenderAvatar, msg.sender);
            incomingMsgType.textContent = '🔊 Tap to listen (Autoplay Paused)';
            incomingSenderName.textContent = `${msg.sender?.name || 'Teammate'} sent a voice note!`;
            
            const tapToListenHandler = () => {
                audioManager.unlockAudio();
                const fallbackAudio = new Audio(msg.audio);
                fallbackAudio.play().catch(() => {});
                incomingCheerBanner.removeEventListener('click', tapToListenHandler);
            };
            incomingCheerBanner.addEventListener('click', tapToListenHandler, { once: true });
        }
    };

    function addFeedItem(item) {
        const div = document.createElement('div');
        div.className = `feed-item ${item.isOwn ? 'own' : 'incoming'}`;
        const icon = item.senderRole === 'runner' ? '🏃' : '📣';

        div.innerHTML = `
            <div class="feed-header">
                <span class="feed-sender">${icon} ${item.senderName}</span>
                <span class="feed-duration">${item.duration}s</span>
            </div>
            <button class="btn-play-feed">▶ Replay Voice</button>
        `;

        div.querySelector('.btn-play-feed').addEventListener('click', () => {
            const a = new Audio(item.audio);
            a.play();
        });

        messageFeed.prepend(div);
        while (messageFeed.children.length > 12) {
            messageFeed.removeChild(messageFeed.lastChild);
        }
    }

    function showReactionToast(data) {
        let container = document.getElementById('toast-queue-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-queue-container';
            container.className = 'toast-queue-container';
            document.body.appendChild(container);
        }

        // Limit to max 4 simultaneous visible toasts in the queue
        if (container.children.length >= 4) {
            const oldest = container.querySelector('.reaction-toast:not(.removing)');
            if (oldest) dismissToast(oldest);
        }

        const toast = document.createElement('div');
        toast.className = 'reaction-toast';

        const map = {
            'gohard': { emoji: '🔥', text: 'Stay Hard! (David Goggins)' },
            'yougotthis': { emoji: '💪', text: 'You can do it!' },
            'vamoporra': { emoji: '🚀', text: 'HORA DO SHOW, PORRA!' },
            'gogogo': { emoji: '⚡', text: 'Run, Forrest, run!' },
            'justdoit': { emoji: '🔥', text: 'DO IT! JUST DO IT! (Shia)' },
            'rumble': { emoji: '🥊', text: "Let's get ready to rumble!" },
            'senna': { emoji: '🏎️', text: 'Tema da Vitória (Senna)' },
            'tetra': { emoji: '🏆', text: 'É TETRA! É TETRA!' },
            'siuuu': { emoji: '⚽', text: 'SIUUUU! (CR7)' },
            'horn': { emoji: '🔥', text: 'Stay Hard!' },
            'whistle': { emoji: '⚡', text: 'Run, Forrest, run!' },
            'applause': { emoji: '💪', text: 'You can do it!' },
            'boost': { emoji: '🚀', text: 'HORA DO SHOW, PORRA!' }
        };

        const senderName = data.sender?.name || data.senderName || 'Cheer Squad';

        if (senderName.startsWith('Targeted:')) {
            toast.classList.add('toast-target');
            toast.innerHTML = `<span style="font-size: 1.15rem;">🎯</span> <span><strong>${escapeHtml(senderName)}</strong></span>`;
        } else {
            const info = map[data.reaction] || { emoji: '📣', text: 'sent cheers!' };
            if (data.reaction === 'boost' || data.reaction === 'applause') {
                toast.classList.add('toast-energy');
            }
            toast.innerHTML = `
                <span style="font-size: 1.15rem; flex-shrink: 0;">${info.emoji}</span>
                <span><strong>${escapeHtml(senderName)}</strong>: ${info.text}</span>
            `;
        }

        container.appendChild(toast);

        // Auto-dismiss after 3.6s with smooth upward sliding transition
        setTimeout(() => {
            dismissToast(toast);
        }, 3600);
    }

    function dismissToast(toastEl) {
        if (!toastEl || toastEl.classList.contains('removing')) return;
        toastEl.classList.add('removing');
        setTimeout(() => {
            if (toastEl.parentNode) toastEl.remove();
        }, 380);
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
});
