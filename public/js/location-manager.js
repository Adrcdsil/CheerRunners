/**
 * CheerRunners - Location Manager
 * Handles:
 * - High-accuracy GPS tracking via navigator.geolocation.watchPosition
 * - Speed, Pace (min/km), cumulative distance (km), and heading
 * - Proximity and ETA calculations to cheer squads / spectators
 * - Desktop test simulation mode centered on Pakenham, Victoria (-38.0712, 145.4848)
 */

class LocationManager {
    constructor() {
        this.watchId = null;
        this.currentLocation = null;
        this.previousLocation = null;
        this.totalDistanceMeters = 0;
        this.routeHistory = [];
        this.isTracking = false;
        this.isSimulating = false;
        this.simulationTimer = null;

        // Callbacks
        this.onLocationUpdate = null; // (locationData)
        this.onError = null;          // (error)
    }

    /**
     * Start live GPS geolocation tracking
     */
    startTracking() {
        if (!navigator.geolocation) {
            if (this.onError) this.onError(new Error('Geolocation is not supported by your browser.'));
            return;
        }

        this.isTracking = true;
        const options = {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 1000
        };

        this.watchId = navigator.geolocation.watchPosition(
            (pos) => this.handlePositionSuccess(pos),
            (err) => {
                console.warn('Geolocation warning / error:', err.message);
                if (this.onError) this.onError(err);
            },
            options
        );
    }

    stopTracking() {
        if (this.watchId !== null) {
            navigator.geolocation.clearWatch(this.watchId);
            this.watchId = null;
        }
        if (this.simulationTimer) {
            clearInterval(this.simulationTimer);
            this.simulationTimer = null;
        }
        this.isTracking = false;
        this.isSimulating = false;
    }

    handlePositionSuccess(pos) {
        const { latitude, longitude, accuracy, speed, heading } = pos.coords;
        const timestamp = pos.timestamp || Date.now();

        let deltaDist = 0;
        if (this.currentLocation) {
            deltaDist = this.calculateDistance(
                this.currentLocation.lat,
                this.currentLocation.lng,
                latitude,
                longitude
            );
            if (deltaDist > 2) {
                this.totalDistanceMeters += deltaDist;
            }
        }

        let currentSpeedKmh = speed ? (speed * 3.6) : 0;
        if (!speed && this.currentLocation && deltaDist > 0) {
            const timeDeltaSec = (timestamp - this.currentLocation.timestamp) / 1000;
            if (timeDeltaSec > 0) {
                currentSpeedKmh = (deltaDist / timeDeltaSec) * 3.6;
            }
        }

        const paceMinKm = this.calculatePace(currentSpeedKmh);

        const locationData = {
            lat: latitude,
            lng: longitude,
            accuracy: Math.round(accuracy || 10),
            speed: parseFloat(currentSpeedKmh.toFixed(1)),
            pace: paceMinKm,
            heading: heading || 0,
            distance: parseFloat((this.totalDistanceMeters / 1000).toFixed(2)),
            timestamp
        };

        this.previousLocation = this.currentLocation;
        this.currentLocation = locationData;
        this.routeHistory.push({ lat: latitude, lng: longitude });

        if (this.onLocationUpdate) {
            this.onLocationUpdate(locationData);
        }
    }

    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371e3;
        const φ1 = (lat1 * Math.PI) / 180;
        const φ2 = (lat2 * Math.PI) / 180;
        const Δφ = ((lat2 - lat1) * Math.PI) / 180;
        const Δλ = ((lon2 - lon1) * Math.PI) / 180;

        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
                  Math.cos(φ1) * Math.cos(φ2) *
                  Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c;
    }

    calculatePace(speedKmh) {
        if (!speedKmh || speedKmh < 1.0) return `--'--"`;
        const minutesPerKm = 60 / speedKmh;
        if (minutesPerKm > 30) return `--'--"`;

        const mins = Math.floor(minutesPerKm);
        const secs = Math.round((minutesPerKm - mins) * 60);
        return `${mins}'${secs.toString().padStart(2, '0')}"`;
    }

    getProximityToTarget(targetLat, targetLng) {
        if (!this.currentLocation) return null;

        const distanceM = this.calculateDistance(
            this.currentLocation.lat,
            this.currentLocation.lng,
            targetLat,
            targetLng
        );

        let etaSeconds = null;
        let etaText = 'Calculating...';

        if (this.currentLocation.speed > 1.5) {
            const speedMetersPerSec = this.currentLocation.speed / 3.6;
            etaSeconds = Math.round(distanceM / speedMetersPerSec);

            if (etaSeconds < 60) {
                etaText = `${etaSeconds}s`;
            } else {
                const mins = Math.floor(etaSeconds / 60);
                const secs = etaSeconds % 60;
                etaText = `${mins}m ${secs}s`;
            }
        } else {
            etaText = distanceM < 50 ? 'Nearby (<50m)' : 'At cheer station';
        }

        return {
            distanceM: Math.round(distanceM),
            distanceFormatted: distanceM >= 1000 ? `${(distanceM / 1000).toFixed(2)} km` : `${Math.round(distanceM)} m`,
            etaText,
            etaSeconds
        };
    }

    /**
     * Simulation mode centered on Pakenham, Victoria (-38.0712, 145.4848)
     */
    startSimulation(startLat = -38.0712, startLng = 145.4848) {
        this.stopTracking();
        this.isSimulating = true;
        this.isTracking = true;
        
        let simLat = startLat;
        let simLng = startLng;
        let simDistance = 0;
        let step = 0;

        this.simulationTimer = setInterval(() => {
            step++;
            // Move along scenic Pakenham Lakeside route
            simLat += 0.00016 * Math.cos(step * 0.12);
            simLng += 0.00019 * Math.sin(step * 0.09) + 0.00007;
            simDistance += 19;

            const fakePos = {
                coords: {
                    latitude: simLat,
                    longitude: simLng,
                    accuracy: 4,
                    speed: 3.4 + Math.sin(step * 0.5) * 0.3, // ~12.2 km/h -> ~4'55" pace
                    heading: (step * 7) % 360
                },
                timestamp: Date.now()
            };

            this.handlePositionSuccess(fakePos);
        }, 2500);
    }
}

window.LocationManager = LocationManager;
