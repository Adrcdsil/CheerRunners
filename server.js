const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { WebSocketServer, WebSocket } = require('ws');
let QRCode = null;
try {
    QRCode = require('qrcode');
} catch (e) {
    console.warn('QRCode module not loaded:', e.message);
}

const app = express();
const PORT = process.env.PORT || 8088;

const ROOMS_FILE = path.join(__dirname, 'rooms.json');
const USERS_FILE = path.join(__dirname, 'users.json');
const CONFIG_FILE = path.join(__dirname, 'config.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper to load and save config from disk
function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
            return JSON.parse(raw);
        }
    } catch (e) {
        console.error('Error loading config.json:', e);
    }
    return {
        cheerCooldownSeconds: 30,
        voiceCooldownSeconds: 2
    };
}

function saveConfig(cfg) {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
    } catch (e) {
        console.error('Error saving config.json:', e);
    }
}

let appConfig = loadConfig();

// Helper to load rooms from disk
function loadRooms() {
    try {
        if (fs.existsSync(ROOMS_FILE)) {
            const raw = fs.readFileSync(ROOMS_FILE, 'utf8');
            return JSON.parse(raw);
        }
    } catch (e) {
        console.error('Error loading rooms.json:', e);
    }
    return [
        { id: "MM SAT 5 10", name: "MM SAT 5 10", description: "Saturday - Dairy Farmers 5km & SriLankan Airlines 10km", category: "Melbourne Marathon", date: "Saturday", distances: "5k, 10k" },
        { id: "MM SUN 21 42", name: "MM SUN 21 42", description: "Sunday - Nike Half Marathon (21.1km) & Nike Full Marathon (42.2km)", category: "Melbourne Marathon", date: "Sunday", distances: "21.1k, 42.2k" }
    ];
}

function saveRooms(roomsList) {
    try {
        fs.writeFileSync(ROOMS_FILE, JSON.stringify(roomsList, null, 2), 'utf8');
    } catch (e) {
        console.error('Error saving rooms.json:', e);
    }
}

// Helper to load and save users from disk
function loadUsers() {
    try {
        if (fs.existsSync(USERS_FILE)) {
            const raw = fs.readFileSync(USERS_FILE, 'utf8');
            return JSON.parse(raw);
        }
    } catch (e) {
        console.error('Error loading users.json:', e);
    }
    return [];
}

function saveUsers(usersList) {
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(usersList, null, 2), 'utf8');
    } catch (e) {
        console.error('Error saving users.json:', e);
    }
}

let registeredRooms = loadRooms();
let registeredUsers = loadUsers();

// API: Get rooms with live active user counts and member list
app.get('/api/rooms', (req, res) => {
    registeredRooms = loadRooms();
    const listWithCounts = registeredRooms.map((r) => {
        const activeRoom = rooms.get(r.id.toUpperCase());
        const activeUsers = [];
        if (activeRoom) {
            activeRoom.forEach((client) => {
                activeUsers.push({
                    id: client.user.id,
                    name: client.user.name,
                    role: client.user.role,
                    avatarType: client.user.avatarType,
                    avatarValue: client.user.avatarValue,
                    avatarColor: client.user.avatarColor,
                    lastLocation: client.lastLocation
                });
            });
        }
        return {
            ...r,
            activeUsersCount: activeUsers.length,
            activeUsers: activeUsers
        };
    });
    res.json(listWithCounts);
});

// API: Get App Configuration (Cooldowns)
app.get('/api/config', (req, res) => {
    appConfig = loadConfig();
    res.json(appConfig);
});

// API: Update App Configuration (Cooldowns) & Broadcast in Real-Time
app.post('/api/config', (req, res) => {
    const { cheerCooldownSeconds, voiceCooldownSeconds } = req.body;
    
    const cheerSec = Math.max(1, Math.min(300, parseInt(cheerCooldownSeconds, 10) || 30));
    const voiceSec = Math.max(0, Math.min(30, parseInt(voiceCooldownSeconds, 10) || 2));

    appConfig = {
        cheerCooldownSeconds: cheerSec,
        voiceCooldownSeconds: voiceSec,
        updatedAt: Date.now()
    };
    saveConfig(appConfig);

    // Broadcast config update to all connected WebSocket clients in real-time
    const payload = JSON.stringify({
        type: 'config_updated',
        config: appConfig
    });

    rooms.forEach((roomUsers) => {
        roomUsers.forEach((client) => {
            if (client.ws.readyState === WebSocket.OPEN) {
                client.ws.send(payload);
            }
        });
    });

    console.log(`[CONFIG UPDATED] Cheer Cooldown: ${cheerSec}s, Voice Cooldown: ${voiceSec}s. Broadcasted to all live clients.`);
    res.json({ success: true, config: appConfig });
});

// API: Generate QR Code (SVG or Data URL)
app.get('/api/qrcode', async (req, res) => {
    try {
        const text = req.query.text || '';
        if (!text) {
            return res.status(400).send('Missing text parameter');
        }
        if (!QRCode) {
            return res.status(500).json({ error: 'QRCode engine unavailable' });
        }
        const format = req.query.format || 'svg';
        if (format === 'svg') {
            const svg = await QRCode.toString(text, { 
                type: 'svg', 
                margin: 2, 
                color: { dark: '#000000', light: '#ffffff' } 
            });
            res.setHeader('Content-Type', 'image/svg+xml');
            return res.send(svg);
        } else {
            const dataUrl = await QRCode.toDataURL(text, { margin: 2, scale: 8 });
            return res.json({ dataUrl });
        }
    } catch (err) {
        console.error('Error generating QR code:', err);
        return res.status(500).json({ error: err.message });
    }
});

// API: Create new custom room
app.post('/api/rooms', (req, res) => {
    const { name, description, category, date, distances } = req.body;
    if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Room name is required' });
    }

    const cleanName = name.trim();
    const cleanId = cleanName.toUpperCase();

    const existing = registeredRooms.find((r) => r.id.toUpperCase() === cleanId);
    if (existing) {
        return res.json({ success: true, room: existing, isExisting: true });
    }

    const newRoom = {
        id: cleanName,
        name: cleanName,
        description: description || 'Custom Community Run',
        category: category || 'Social Run',
        date: date || 'Today',
        distances: distances || 'Open',
        createdAt: Date.now()
    };

    registeredRooms.push(newRoom);
    saveRooms(registeredRooms);

    console.log(`[ROOM CREATED] New room registered: "${cleanName}"`);
    res.status(201).json({ success: true, room: newRoom, isExisting: false });
});

// API: Edit existing room
app.put('/api/rooms/:id', (req, res) => {
    const targetId = decodeURIComponent(req.params.id).toUpperCase().trim();
    const { name, description, category, date, distances } = req.body;

    const roomIndex = registeredRooms.findIndex((r) => r.id.toUpperCase() === targetId);
    if (roomIndex === -1) {
        return res.status(404).json({ error: 'Room not found' });
    }

    const updatedRoom = {
        ...registeredRooms[roomIndex],
        name: name ? name.trim() : registeredRooms[roomIndex].name,
        description: description !== undefined ? description : registeredRooms[roomIndex].description,
        category: category !== undefined ? category : registeredRooms[roomIndex].category,
        date: date !== undefined ? date : registeredRooms[roomIndex].date,
        distances: distances !== undefined ? distances : registeredRooms[roomIndex].distances,
        updatedAt: Date.now()
    };

    registeredRooms[roomIndex] = updatedRoom;
    saveRooms(registeredRooms);

    console.log(`[ROOM UPDATED] Room "${targetId}" updated`);
    res.json({ success: true, room: updatedRoom });
});

// API: Delete room
app.delete('/api/rooms/:id', (req, res) => {
    const targetId = decodeURIComponent(req.params.id).toUpperCase().trim();
    const roomIndex = registeredRooms.findIndex((r) => r.id.toUpperCase() === targetId);
    if (roomIndex === -1) {
        return res.status(404).json({ error: 'Room not found' });
    }

    const removed = registeredRooms.splice(roomIndex, 1)[0];
    saveRooms(registeredRooms);

    // If active connections exist in this room, disconnect or alert them
    if (rooms.has(targetId)) {
        const activeRoom = rooms.get(targetId);
        activeRoom.forEach((client) => {
            if (client.ws.readyState === WebSocket.OPEN) {
                client.ws.send(JSON.stringify({
                    type: 'room_closed',
                    message: `Room "${removed.name}" was closed by Administrator.`
                }));
            }
        });
        rooms.delete(targetId);
    }

    console.log(`[ROOM DELETED] Room "${targetId}" removed`);
    res.json({ success: true, message: `Room "${removed.name}" deleted successfully` });
});

// ==========================================
// USERS CRUD & MANAGEMENT API
// ==========================================

// Helper to get all active connected users across all rooms
function getLiveConnectedUsers() {
    const liveMap = new Map();
    rooms.forEach((roomUsers, roomId) => {
        roomUsers.forEach((client, userId) => {
            liveMap.set(userId, {
                id: userId,
                name: client.user.name,
                role: client.user.role,
                avatarType: client.user.avatarType,
                avatarValue: client.user.avatarValue,
                avatarColor: client.user.avatarColor,
                currentRoom: roomId,
                isOnline: true,
                lastLocation: client.lastLocation,
                joinedAt: client.user.joinedAt
            });
        });
    });
    return liveMap;
}

// API: Get all users (Registered roster + Live status)
app.get('/api/users', (req, res) => {
    registeredUsers = loadUsers();
    const { registeredOnly, role } = req.query;

    // Fast-path: Return strictly official persistent registered users
    if (registeredOnly === 'true') {
        let filtered = registeredUsers;
        if (role) {
            filtered = filtered.filter(u => u.role === role);
        }
        return res.json(filtered);
    }

    const liveMap = getLiveConnectedUsers();
    const resultUsers = [];
    const seenIds = new Set();

    // 1. Process all registered users
    registeredUsers.forEach((regUser) => {
        seenIds.add(regUser.id);
        const liveInfo = liveMap.get(regUser.id);
        resultUsers.push({
            ...regUser,
            isOnline: !!liveInfo,
            currentRoom: liveInfo ? liveInfo.currentRoom : (regUser.defaultRoom || 'None'),
            currentRole: liveInfo ? liveInfo.role : regUser.role,
            lastLocation: liveInfo ? liveInfo.lastLocation : null,
            joinedAt: liveInfo ? liveInfo.joinedAt : null
        });
    });

    // 2. Also include any ephemeral live users currently connected that aren't yet in registeredUsers
    liveMap.forEach((liveInfo, userId) => {
        if (!seenIds.has(userId)) {
            resultUsers.push({
                id: userId,
                name: liveInfo.name,
                role: liveInfo.role,
                avatarType: liveInfo.avatarType,
                avatarValue: liveInfo.avatarValue,
                avatarColor: liveInfo.avatarColor,
                defaultRoom: liveInfo.currentRoom,
                currentRoom: liveInfo.currentRoom,
                isOnline: true,
                notes: 'Guest / Live Connected User',
                lastLocation: liveInfo.lastLocation,
                joinedAt: liveInfo.joinedAt,
                createdAt: liveInfo.joinedAt || Date.now()
            });
        }
    });

    if (role) {
        return res.json(resultUsers.filter(u => u.role === role || u.currentRole === role));
    }

    res.json(resultUsers);
});

// API: Create new user
app.post('/api/users', (req, res) => {
    const { name, email, role, avatarType, avatarValue, avatarColor, defaultRoom, notes } = req.body;
    if (!name || !name.trim()) {
        return res.status(400).json({ error: 'User name is required' });
    }

    const newId = 'user_' + Math.random().toString(36).substring(2, 9);
    const newUser = {
        id: newId,
        name: name.trim(),
        email: email ? email.trim() : '',
        role: role || 'runner',
        avatarType: avatarType || 'initials',
        avatarValue: avatarValue || name.trim().substring(0, 2).toUpperCase(),
        avatarColor: avatarColor || '#00f2fe',
        defaultRoom: defaultRoom || 'PAKENHAM RUN CLUB',
        notes: notes || '',
        createdAt: Date.now()
    };

    registeredUsers.push(newUser);
    saveUsers(registeredUsers);

    console.log(`[USER CREATED] New user added to roster: "${newUser.name}" (${newUser.role})`);
    res.status(201).json({ success: true, user: newUser });
});

// API: Edit existing user
app.put('/api/users/:id', (req, res) => {
    const userId = req.params.id;
    const { name, email, role, avatarType, avatarValue, avatarColor, defaultRoom, notes } = req.body;

    let userIndex = registeredUsers.findIndex((u) => u.id === userId);
    
    // If user was an ephemeral guest, promote to registered
    if (userIndex === -1) {
        const liveMap = getLiveConnectedUsers();
        const liveGuest = liveMap.get(userId);
        if (liveGuest) {
            registeredUsers.push({
                id: userId,
                name: name ? name.trim() : liveGuest.name,
                email: email ? email.trim() : '',
                role: role || liveGuest.role,
                avatarType: avatarType || liveGuest.avatarType,
                avatarValue: avatarValue || liveGuest.avatarValue,
                avatarColor: avatarColor || liveGuest.avatarColor,
                defaultRoom: defaultRoom || liveGuest.currentRoom,
                notes: notes || '',
                createdAt: Date.now()
            });
            saveUsers(registeredUsers);
            return res.json({ success: true, user: registeredUsers[registeredUsers.length - 1] });
        }
        return res.status(404).json({ error: 'User not found' });
    }

    const updatedUser = {
        ...registeredUsers[userIndex],
        name: name ? name.trim() : registeredUsers[userIndex].name,
        email: email !== undefined ? email.trim() : registeredUsers[userIndex].email,
        role: role || registeredUsers[userIndex].role,
        avatarType: avatarType || registeredUsers[userIndex].avatarType,
        avatarValue: avatarValue || registeredUsers[userIndex].avatarValue,
        avatarColor: avatarColor || registeredUsers[userIndex].avatarColor,
        defaultRoom: defaultRoom !== undefined ? defaultRoom : registeredUsers[userIndex].defaultRoom,
        notes: notes !== undefined ? notes : registeredUsers[userIndex].notes,
        updatedAt: Date.now()
    };

    registeredUsers[userIndex] = updatedUser;
    saveUsers(registeredUsers);

    // If currently connected in any room, update live user profile in memory
    rooms.forEach((roomUsers) => {
        if (roomUsers.has(userId)) {
            const client = roomUsers.get(userId);
            client.user.name = updatedUser.name;
            client.user.role = updatedUser.role;
            client.user.avatarType = updatedUser.avatarType;
            client.user.avatarValue = updatedUser.avatarValue;
            client.user.avatarColor = updatedUser.avatarColor;
        }
    });

    console.log(`[USER UPDATED] User "${userId}" updated (${updatedUser.name})`);
    res.json({ success: true, user: updatedUser });
});

// API: Delete user
app.delete('/api/users/:id', (req, res) => {
    const userId = req.params.id;
    const userIndex = registeredUsers.findIndex((u) => u.id === userId);
    
    if (userIndex !== -1) {
        const removed = registeredUsers.splice(userIndex, 1)[0];
        saveUsers(registeredUsers);
        console.log(`[USER DELETED] User "${userId}" removed from roster`);
    }

    // If user is currently online, disconnect them
    rooms.forEach((roomUsers, roomId) => {
        if (roomUsers.has(userId)) {
            const client = roomUsers.get(userId);
            if (client.ws.readyState === WebSocket.OPEN) {
                client.ws.send(JSON.stringify({
                    type: 'user_kicked',
                    message: 'Your account was deleted by Administrator.'
                }));
                client.ws.close();
            }
            roomUsers.delete(userId);
        }
    });

    res.json({ success: true, message: `User "${userId}" removed successfully` });
});

// API: Kick / Disconnect user from active session
app.post('/api/users/:id/kick', (req, res) => {
    const userId = req.params.id;
    let found = false;

    rooms.forEach((roomUsers, roomId) => {
        if (roomUsers.has(userId)) {
            found = true;
            const client = roomUsers.get(userId);
            if (client.ws.readyState === WebSocket.OPEN) {
                client.ws.send(JSON.stringify({
                    type: 'user_kicked',
                    message: 'You have been disconnected by the Administrator.'
                }));
                client.ws.close();
            }
            roomUsers.delete(userId);
            console.log(`[USER KICKED] User ${userId} disconnected from room [${roomId}]`);
        }
    });

    if (found) {
        res.json({ success: true, message: `User ${userId} was disconnected.` });
    } else {
        res.status(404).json({ error: 'User is not currently connected.' });
    }
});

// API: System Admin Overview & Metrics
app.get('/api/admin/overview', (req, res) => {
    registeredUsers = loadUsers();
    registeredRooms = loadRooms();
    const liveMap = getLiveConnectedUsers();
    let runnerCount = 0;
    let cheerCount = 0;

    liveMap.forEach((u) => {
        if (u.role === 'runner') runnerCount++;
        else cheerCount++;
    });

    res.json({
        app: 'CheerRunners Live',
        totalRooms: registeredRooms.length,
        totalRegisteredUsers: registeredUsers.length,
        activeConnections: wss.clients.size,
        onlineUsers: liveMap.size,
        onlineRunners: runnerCount,
        onlineCheerSquad: cheerCount,
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString()
    });
});

// API: Admin Broadcast Announcement to Rooms
app.post('/api/admin/broadcast', (req, res) => {
    const { roomId, message } = req.body;
    if (!message || !message.trim()) {
        return res.status(400).json({ error: 'Announcement message is required' });
    }

    const targetRoomId = (roomId || 'ALL').toUpperCase().trim();
    const payload = {
        type: 'admin_announcement',
        sender: { id: 'admin_director', name: 'Race Director', role: 'admin' },
        message: message.trim(),
        timestamp: Date.now()
    };

    if (targetRoomId === 'ALL') {
        rooms.forEach((roomUsers) => {
            roomUsers.forEach((client) => {
                if (client.ws.readyState === WebSocket.OPEN) {
                    client.ws.send(JSON.stringify(payload));
                }
            });
        });
        console.log(`[BROADCAST] Race Director broadcast to ALL rooms: "${message.trim()}"`);
    } else {
        broadcastToRoom(targetRoomId, 'admin_director', payload, true);
        console.log(`[BROADCAST] Race Director broadcast to [${targetRoomId}]: "${message.trim()}"`);
    }

    res.json({ success: true, message: `Broadcast successfully dispatched to ${targetRoomId}` });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'online',
        app: 'CheerRunners Live',
        time: new Date().toISOString(),
        connections: wss.clients.size,
        activeRooms: rooms.size
    });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Rooms map: roomId -> Map(userId -> { ws, user, lastLocation })
const rooms = new Map();

function broadcastToRoom(roomId, senderId, data, includeSender = false, targetUserId = 'all') {
    const room = rooms.get(roomId);
    if (!room) return;

    const payload = JSON.stringify(data);

    // Group filter: All Runners
    if (targetUserId === 'runners') {
        room.forEach((client, id) => {
            if (client.user.role === 'runner' && (includeSender || id !== senderId) && client.ws.readyState === WebSocket.OPEN) {
                client.ws.send(payload);
            }
        });
        return;
    }

    // Group filter: Cheer Squad Only
    if (targetUserId === 'cheer') {
        room.forEach((client, id) => {
            if (client.user.role === 'cheer' && (includeSender || id !== senderId) && client.ws.readyState === WebSocket.OPEN) {
                client.ws.send(payload);
            }
        });
        return;
    }

    // Specific Individual User
    if (targetUserId && targetUserId !== 'all') {
        const targetClient = room.get(targetUserId);
        if (targetClient && targetClient.ws.readyState === WebSocket.OPEN) {
            targetClient.ws.send(payload);
        }
        return;
    }

    // Default: Broadcast to entire room
    room.forEach((client, id) => {
        if ((includeSender || id !== senderId) && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(payload);
        }
    });
}

function handleUserJoin(ws, roomId, user) {
    const cleanRoomId = roomId.toUpperCase().trim();
    const userId = user.id;

    if (!rooms.has(cleanRoomId)) {
        rooms.set(cleanRoomId, new Map());
    }

    const room = rooms.get(cleanRoomId);
    room.set(userId, {
        ws,
        user: {
            id: user.id,
            name: user.name,
            role: user.role || 'runner',
            avatarType: user.avatarType || 'initials',
            avatarValue: user.avatarValue || 'CR',
            avatarColor: user.avatarColor || '#00f2fe',
            joinedAt: Date.now()
        },
        lastLocation: null
    });

    // Sync user into persistent registeredUsers roster if pre-registered
    const existingIndex = registeredUsers.findIndex((u) => u.id === userId);
    if (existingIndex !== -1) {
        registeredUsers[existingIndex] = {
            ...registeredUsers[existingIndex],
            name: user.name || registeredUsers[existingIndex].name,
            role: user.role || registeredUsers[existingIndex].role,
            avatarType: user.avatarType || registeredUsers[existingIndex].avatarType,
            avatarValue: user.avatarValue || registeredUsers[existingIndex].avatarValue,
            avatarColor: user.avatarColor || registeredUsers[existingIndex].avatarColor,
            defaultRoom: cleanRoomId,
            lastSeen: Date.now()
        };
        saveUsers(registeredUsers);
    }

    // Send room snapshot to the joining user
    const existingUsers = [];
    room.forEach((client) => {
        existingUsers.push({
            id: client.user.id,
            name: client.user.name,
            role: client.user.role,
            avatarType: client.user.avatarType,
            avatarValue: client.user.avatarValue,
            avatarColor: client.user.avatarColor,
            location: client.lastLocation
        });
    });

    ws.send(JSON.stringify({
        type: 'room_snapshot',
        roomId: cleanRoomId,
        users: existingUsers
    }));

    ws.send(JSON.stringify({
        type: 'config_snapshot',
        config: appConfig
    }));

    // Notify everyone else in the room
    broadcastToRoom(cleanRoomId, userId, {
        type: 'user_joined',
        user: room.get(userId).user
    }, false);

    console.log(`[JOIN] "${user.name}" (${user.role}) entered room [${cleanRoomId}]. Total users: ${room.size}`);
}

function handleUserLeave(roomId, userId) {
    if (!roomId || !userId || !rooms.has(roomId)) return;
    const room = rooms.get(roomId);
    room.delete(userId);
    console.log(`[LEAVE] User ${userId} left room [${roomId}]. Remaining: ${room.size}`);

    broadcastToRoom(roomId, userId, {
        type: 'user_left',
        userId: userId
    }, false);

    if (room.size === 0) {
        rooms.delete(roomId);
    }
}

wss.on('connection', (ws) => {
    let currentRoomId = null;
    let currentUserId = null;
    let currentUserProfile = null;

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            const { type, roomId = 'MM SUN 21k 42k', user } = data;

            switch (type) {
                case 'join': {
                    currentRoomId = roomId.toUpperCase().trim();
                    currentUserId = user.id;
                    currentUserProfile = user;
                    handleUserJoin(ws, currentRoomId, user);
                    break;
                }

                case 'switch_room': {
                    const newRoomId = data.newRoomId.toUpperCase().trim();
                    if (currentRoomId && currentUserId) {
                        handleUserLeave(currentRoomId, currentUserId);
                    }
                    currentRoomId = newRoomId;
                    if (currentUserProfile) {
                        handleUserJoin(ws, currentRoomId, currentUserProfile);
                    }
                    console.log(`[SWITCH] User ${currentUserId} switched to room [${newRoomId}]`);
                    break;
                }

                case 'location_update': {
                    if (!currentRoomId || !currentUserId) return;
                    const room = rooms.get(currentRoomId);
                    if (room && room.has(currentUserId)) {
                        const client = room.get(currentUserId);
                        client.lastLocation = {
                            lat: data.location.lat,
                            lng: data.location.lng,
                            accuracy: data.location.accuracy,
                            speed: data.location.speed,
                            heading: data.location.heading,
                            pace: data.location.pace,
                            distance: data.location.distance,
                            timestamp: Date.now()
                        };

                        broadcastToRoom(currentRoomId, currentUserId, {
                            type: 'location_update',
                            userId: currentUserId,
                            location: client.lastLocation
                        }, false);
                    }
                    break;
                }

                case 'audio_message': {
                    if (!currentRoomId || !currentUserId) return;
                    const targetId = data.targetUserId || 'all';
                    console.log(`[AUDIO] Voice note (${data.duration}s) from ${currentUserId} to ${targetId} in room [${currentRoomId}]`);

                    const audioPayload = {
                        type: 'audio_message',
                        sender: {
                            id: currentUserId,
                            name: data.senderName,
                            role: data.senderRole,
                            avatarType: data.senderAvatarType,
                            avatarValue: data.senderAvatarValue,
                            avatarColor: data.senderAvatarColor
                        },
                        targetUserId: targetId,
                        audio: data.audio,
                        duration: data.duration,
                        timestamp: Date.now()
                    };

                    broadcastToRoom(currentRoomId, currentUserId, audioPayload, false, targetId);
                    break;
                }

                case 'quick_reaction': {
                    if (!currentRoomId || !currentUserId) return;
                    const targetId = data.targetUserId || 'all';
                    broadcastToRoom(currentRoomId, currentUserId, {
                        type: 'quick_reaction',
                        sender: {
                            id: currentUserId,
                            name: data.senderName,
                            role: data.senderRole
                        },
                        targetUserId: targetId,
                        reaction: data.reaction,
                        timestamp: Date.now()
                    }, true, targetId);
                    break;
                }

                case 'ping': {
                    ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
                    break;
                }
            }
        } catch (err) {
            console.error('[WS ERROR] Failed to process message:', err.message);
        }
    });

    ws.on('close', () => {
        if (currentRoomId && currentUserId) {
            handleUserLeave(currentRoomId, currentUserId);
        }
    });

    ws.on('error', (err) => {
        console.error('[WS CLIENT ERROR]', err.message);
    });
});

server.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🏃 CHEERRUNNERS SERVER RUNNING`);
    console.log(`👉 http://localhost:${PORT}`);
    console.log(`👉 WebSocket Server ready on ws://localhost:${PORT}`);
    console.log(`====================================================`);
});
