/**
 * CheerRunners - Map Manager
 * Handles:
 * - Leaflet live map using official OpenStreetMap tiles
 * - Centered on Pakenham, Victoria (-38.0712, 145.4848)
 * - CSS dark-mode sports filter for high-contrast aesthetics
 * - Dynamic Runner HUD Card map markers (Avatar, Name, Distance, Pace, Speed)
 * - Glowing neon breadcrumb route trail
 * - Proximity connector line between cheerleader and runner
 * - Auto-panning & view centering controls
 */

class MapManager {
    constructor(containerId = 'map-container') {
        this.containerId = containerId;
        this.map = null;
        this.userMarkers = new Map(); // userId -> Leaflet Marker
        this.routeGlowPolyline = null;
        this.routePolyline = null;
        this.routeCorePolyline = null;
        this.proximityLine = null;
        this.isAutoCenter = true;
        this.currentCenterUser = null;
        this.selectedTargetUserId = 'all';
        this.onMarkerClick = null;
        this.courseLayers = new Map();
        this.courseGroup = null;
        this.activeRoomId = null;
    }

    // Default center: Pakenham, Victoria, Australia
    init(defaultLat = -38.0712, defaultLng = 145.4848, defaultZoom = 14) {
        if (this.map) return;

        this.map = L.map(this.containerId, {
            zoomControl: false,
            attributionControl: false
        }).setView([defaultLat, defaultLng], defaultZoom);

        // Official OpenStreetMap Tiles (Clean, fast, high-contrast, zero watermark)
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(this.map);

        L.control.zoom({ position: 'topright' }).addTo(this.map);

        this.courseGroup = L.layerGroup().addTo(this.map);

        // Rastro do corredor: 3 camadas néon vivaço (Glow Halo + Vivid Racing Red Core + Inner Highlight)
        this.routeGlowPolyline = L.polyline([], {
            color: '#ff0038',
            weight: 9,
            opacity: 0.38,
            lineCap: 'round',
            lineJoin: 'round'
        }).addTo(this.map);

        this.routePolyline = L.polyline([], {
            color: '#ff0038',
            weight: 4,
            opacity: 1.0,
            lineCap: 'round',
            lineJoin: 'round',
            dashArray: null
        }).addTo(this.map);

        this.routeCorePolyline = L.polyline([], {
            color: '#ff708a',
            weight: 1.5,
            opacity: 0.85,
            lineCap: 'round',
            lineJoin: 'round'
        }).addTo(this.map);

        this.map.on('dragstart', () => {
            this.isAutoCenter = false;
            const btn = document.getElementById('btn-recenter');
            if (btn) btn.classList.remove('active');
        });

        setTimeout(() => {
            if (this.map) this.map.invalidateSize();
        }, 200);
    }

    resetRoute() {
        if (this.routeGlowPolyline) {
            this.routeGlowPolyline.setLatLngs([]);
        }
        if (this.routePolyline) {
            this.routePolyline.setLatLngs([]);
        }
        if (this.routeCorePolyline) {
            this.routeCorePolyline.setLatLngs([]);
        }
        if (this.proximityLine) {
            this.map.removeLayer(this.proximityLine);
            this.proximityLine = null;
        }
        this.userMarkers.forEach((marker) => {
            this.map.removeLayer(marker);
        });
        this.userMarkers.clear();
    }

    /**
     * Create or update marker for a user
     */
    updateUserMarker(user, location) {
        if (!this.map || !location) return;

        const { id } = user;
        const latLng = [location.lat, location.lng];
        const isTargeted = (this.selectedTargetUserId === id);

        if (!this.userMarkers.has(id)) {
            const iconHtml = this.createMarkerHtml(user, location, isTargeted);
            const customIcon = L.divIcon({
                className: 'custom-map-marker',
                html: iconHtml,
                iconSize: [154, 110],
                iconAnchor: [77, 103]
            });

            const marker = L.marker(latLng, { icon: customIcon }).addTo(this.map);
            marker.on('click', () => {
                if (this.onMarkerClick) {
                    this.onMarkerClick(user);
                }
            });
            this.userMarkers.set(id, marker);
        } else {
            const marker = this.userMarkers.get(id);
            marker.setLatLng(latLng);
            const iconEl = marker.getElement();
            if (iconEl) {
                iconEl.innerHTML = this.createMarkerHtml(user, location, isTargeted);
            }
        }

        if (user.role === 'runner') {
            if (this.routeGlowPolyline) this.routeGlowPolyline.addLatLng(latLng);
            if (this.routePolyline) this.routePolyline.addLatLng(latLng);
            if (this.routeCorePolyline) this.routeCorePolyline.addLatLng(latLng);

            if (this.isAutoCenter) {
                this.map.panTo(latLng, { animate: true, duration: 0.8 });
            }
        }
    }

    /**
     * Updates which user marker is visually targeted on the map
     * Supports: 'all', 'runners', 'cheer', or specific user ID
     */
    setTargetedUser(targetId) {
        this.selectedTargetUserId = targetId;
        this.userMarkers.forEach((marker, id) => {
            const el = marker.getElement();
            if (el) {
                const container = el.querySelector('.map-hud-marker-container');
                if (container) {
                    let isTarget = false;
                    if (targetId === 'all') {
                        isTarget = false;
                    } else if (targetId === 'runners') {
                        isTarget = container.classList.contains('runner');
                    } else if (targetId === 'cheer') {
                        isTarget = container.classList.contains('cheer');
                    } else {
                        isTarget = (id === targetId);
                    }

                    container.classList.toggle('is-targeted', isTarget);
                    if (marker.setZIndexOffset) {
                        marker.setZIndexOffset(isTarget ? 1000 : 0);
                    }

                    const existingBadge = container.querySelector('.hud-target-badge');
                    if (isTarget && !existingBadge) {
                        const topBox = container.querySelector('.hud-card-top');
                        if (topBox) {
                            const badge = document.createElement('div');
                            badge.className = 'hud-target-badge';
                            badge.innerHTML = '<span>🎯 TARGET</span>';
                            topBox.appendChild(badge);
                        }
                    } else if (!isTarget && existingBadge) {
                        existingBadge.remove();
                    }
                }
            }
        });
    }

    /**
     * Generates a sleek floating Runner HUD Card marker
     * Displays: Avatar/Photo, Name, Distance, Pace, and Speed in tabular HUD format
     */
    createMarkerHtml(user, location, isTargeted = false) {
        const { name, role, avatarType, avatarValue, avatarColor } = user;
        const isRunner = role === 'runner';
        const cardClass = isRunner ? 'hud-card-runner' : 'hud-card-cheer';
        const paceVal = location.pace || `--'--"`;
        const distanceVal = location.distance !== undefined ? `${location.distance} km` : `0.00 km`;

        let innerAvatarHtml = '';
        let customAvatarStyle = '';

        if (avatarType === 'photo' && avatarValue) {
            innerAvatarHtml = `<img src="${avatarValue}" alt="${name}">`;
        } else if (avatarType === 'emoji' && avatarValue) {
            innerAvatarHtml = `<span>${avatarValue}</span>`;
        } else if (avatarType === 'initials' && avatarValue) {
            innerAvatarHtml = `<span>${avatarValue}</span>`;
            if (avatarColor) {
                const isWhite = avatarColor === '#ffffff' || avatarColor === '#fff';
                customAvatarStyle = `background: ${avatarColor}; color: ${isWhite ? '#0b0e14' : '#ffffff'}; border-color: ${isWhite ? '#cbd5e1' : '#ffffff'};`;
            }
        } else {
            innerAvatarHtml = `<span>${isRunner ? '🏃' : '📣'}</span>`;
        }

        const targetBadgeHtml = isTargeted ? `<div class="hud-target-badge"><span>🎯</span></div>` : '';

        return `
            <div class="map-hud-marker-container ${role} ${isTargeted ? 'is-targeted' : ''}">
                <div class="hud-marker-pulse"></div>
                
                <!-- Foto/Avatar Maior e em Destaque Acima -->
                <div class="hud-crown-avatar-wrapper">
                    <div class="hud-crown-avatar" style="${customAvatarStyle}">
                        ${innerAvatarHtml}
                    </div>
                    ${targetBadgeHtml}
                </div>

                <!-- Quadrinho do Atleta -->
                <div class="map-runner-hud-card ${cardClass}">
                    <!-- Nome do Atleta -->
                    <div class="hud-card-name">
                        <span>${name}</span>
                    </div>

                    <!-- Métricas: Dist & Pace (Sem Legendas) -->
                    ${isRunner ? `
                    <div class="hud-metrics-direct">
                        <span class="hud-metric-val highlight-dist">${distanceVal}</span>
                        <span class="hud-metric-dot">•</span>
                        <span class="hud-metric-val highlight-pace">${paceVal}</span>
                    </div>
                    ` : `
                    <div class="hud-metrics-direct cheer">
                        <span class="hud-cheer-label">CHEER SQUAD</span>
                    </div>
                    `}
                </div>
                <div class="hud-pointer-arrow"></div>
            </div>
        `;
    }

    removeUserMarker(userId) {
        if (this.userMarkers.has(userId)) {
            const marker = this.userMarkers.get(userId);
            this.map.removeLayer(marker);
            this.userMarkers.delete(userId);
        }
    }

    updateProximityLine(cheerLatLng, runnerLatLng, distanceText) {
        if (!this.map) return;

        if (!this.proximityLine) {
            this.proximityLine = L.polyline([cheerLatLng, runnerLatLng], {
                color: '#007aff',
                weight: 3,
                dashArray: '6, 8',
                opacity: 0.85
            }).addTo(this.map);
        } else {
            this.proximityLine.setLatLngs([cheerLatLng, runnerLatLng]);
        }
    }

    centerOn(lat, lng, zoom = 15) {
        if (this.map) {
            this.isAutoCenter = true;
            this.map.flyTo([lat, lng], zoom, { duration: 1.2 });
            const btn = document.getElementById('btn-recenter');
            if (btn) btn.classList.add('active');
        }
    }

    /**
     * Loads and overlays the official GPX race routes for the active room
     * Handles:
     * - 5k & 10k in distinct vibrant colors
     * - 21k & 42k in "vermelho mais clarinho" (Coral Light Red & Soft Crimson)
     * - Start, Finish (MCG), and milestone markers
     * - Map bounds auto-fitting
     */
    loadRoomCourses(roomId) {
        if (!this.map || !window.COURSE_DATA) return;

        this.activeRoomId = roomId;

        if (this.courseGroup) {
            this.courseGroup.clearLayers();
        }
        this.courseLayers.clear();

        // 1. Resolve active room data
        let roomData = window.COURSE_DATA[roomId];
        if (!roomData) {
            const upper = (roomId || '').toUpperCase();
            if (upper.includes('21') || upper.includes('42') || upper.includes('SUN')) {
                roomData = window.COURSE_DATA['MM SUN 21k 42k'];
            } else if (upper.includes('5') || upper.includes('10') || upper.includes('SAT')) {
                roomData = window.COURSE_DATA['MM SAT 5k 10k'];
            } else if (upper.includes('PAK')) {
                roomData = window.COURSE_DATA['PAKENHAM RUN CLUB'];
            } else {
                roomData = window.COURSE_DATA['MM SUN 21k 42k'];
            }
        }

        // Collect ALL distinct courses across COURSE_DATA so user can toggle 5k, 10k, 21k, 42k anytime
        const allRegisteredCourses = [];
        const seenIds = new Set();

        // Add active room courses first (marked as initial)
        if (roomData && roomData.courses) {
            roomData.courses.forEach(c => {
                if (!seenIds.has(c.id)) {
                    seenIds.add(c.id);
                    allRegisteredCourses.push({ ...c, isInitial: true });
                }
            });
        }

        // Add remaining courses from COURSE_DATA (5k, 10k, 21k, 42k)
        Object.values(window.COURSE_DATA).forEach(rd => {
            if (rd.courses) {
                rd.courses.forEach(c => {
                    if (!seenIds.has(c.id)) {
                        seenIds.add(c.id);
                        allRegisteredCourses.push({ ...c, isInitial: false });
                    }
                });
            }
        });

        const allLatLngs = [];

        allRegisteredCourses.forEach((course) => {
            const courseSubGroup = L.layerGroup();

            // Reference route line (calibrated with 4.5px weight and 0.70 opacity for clear contrast)
            const coreLine = L.polyline(course.coordinates, {
                color: course.color,
                weight: 4.5,
                opacity: 0.70,
                lineCap: 'round',
                lineJoin: 'round'
            });

            // Interactive highlight on hover/touch
            coreLine.on('mouseover', () => {
                coreLine.setStyle({ opacity: 0.95, weight: 6 });
            });
            coreLine.on('mouseout', () => {
                coreLine.setStyle({ opacity: 0.70, weight: 4.5 });
            });

            coreLine.bindTooltip(`
                <div style="font-weight: 800; font-size: 0.82rem; color: #041018;">
                    ${course.name}
                </div>
                <div style="font-size: 0.72rem; color: #475569;">
                    Distance: <strong>${course.distanceKm} km</strong>
                </div>
            `, { sticky: true, opacity: 0.95 });

            courseSubGroup.addLayer(coreLine);

            const isVisible = course.isInitial;

            // Only add initial courses to map group and initial bounds calculation
            if (isVisible) {
                this.courseGroup.addLayer(courseSubGroup);
                course.coordinates.forEach((pt) => allLatLngs.push(pt));
            }

            // Store in tracking map
            this.courseLayers.set(course.id, {
                subGroup: courseSubGroup,
                course: course,
                coordinates: course.coordinates,
                visible: isVisible
            });
        });

        // Fit map bounds to encompass visible courses
        if (allLatLngs.length > 0) {
            this.map.fitBounds(allLatLngs, {
                padding: [60, 60],
                maxZoom: 15,
                animate: true
            });
        }

        // Notify UI to synchronize dial buttons
        if (this.onCoursesLoaded) {
            this.onCoursesLoaded(this.courseLayers);
        }
    }

    /**
     * Toggles individual course visibility (e.g. toggle 5k, 10k, 21k, or 42k)
     */
    toggleCourseVisibility(courseId, isVisible) {
        if (!this.courseLayers.has(courseId) || !this.courseGroup) return;

        const entry = this.courseLayers.get(courseId);
        entry.visible = isVisible;

        if (isVisible) {
            if (!this.courseGroup.hasLayer(entry.subGroup)) {
                this.courseGroup.addLayer(entry.subGroup);
            }
        } else {
            if (this.courseGroup.hasLayer(entry.subGroup)) {
                this.courseGroup.removeLayer(entry.subGroup);
            }
        }
    }

    isCourseVisible(courseId) {
        if (!this.courseLayers.has(courseId)) return false;
        return !!this.courseLayers.get(courseId).visible;
    }

    fitVisibleCourses() {
        if (!this.map) return;
        const pts = [];
        this.courseLayers.forEach(entry => {
            if (entry.visible && entry.coordinates) {
                entry.coordinates.forEach(pt => pts.push(pt));
            }
        });
        if (pts.length > 0) {
            this.map.fitBounds(pts, { padding: [60, 60], maxZoom: 15, animate: true });
        }
    }

    /**
     * Renders floating interactive route legend (Disabled to keep map clean and unobstructed)
     */
    renderCourseLegend(roomData) {
        // Disabled: routes are drawn directly on map roads without floating cards
    }
}

window.MapManager = MapManager;
