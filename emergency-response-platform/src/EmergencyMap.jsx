import { useMemo, useEffect, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./map.css";

// Severity-based emergency marker icons
const markerIcons = {
  Critical: new L.Icon({
    iconUrl:
      "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
    shadowUrl:
      "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
  }),

  High: new L.Icon({
    iconUrl:
      "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png",
    shadowUrl:
      "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
  }),

  Medium: new L.Icon({
    iconUrl:
      "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-gold.png",
    shadowUrl:
      "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
  }),

  Low: new L.Icon({
    iconUrl:
      "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png",
    shadowUrl:
      "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
  }),
};

function getSeverityIcon(severity) {
  return markerIcons[severity] || markerIcons.Medium;
}

// Automatically fit the map to emergency markers
function FitMarkers({ points }) {
  const map = useMap();

  useEffect(() => {
    if (!points.length) return;

    const bounds = L.latLngBounds(
      points.map((point) => [point.lat, point.lng])
    );

    if (bounds.isValid()) {
      map.fitBounds(bounds, {
        padding: [30, 30],
        maxZoom: 14,
      });
    }
  }, [map, points]);

  return null;
}

// Validate incident coordinates
function coordinatesFor(report) {
  const rawLat = report.latitude ?? report.lat;
  const rawLng = report.longitude ?? report.lng;

  if (
    rawLat == null ||
    rawLng == null ||
    rawLat === "" ||
    rawLng === ""
  ) {
    return null;
  }

  const lat = Number(rawLat);
  const lng = Number(rawLng);

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return null;
  }

  return { lat, lng };
}

// Live user location tracking component
function LiveUserLocation() {
  const map = useMap();

  const [position, setPosition] = useState(null);
  const [error, setError] = useState("");
  const [tracking, setTracking] = useState(false);

  useEffect(() => {
    if (!navigator.geolocation) {
      setError("Your browser does not support location access.");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (result) => {
        const nextPosition = [
          result.coords.latitude,
          result.coords.longitude,
        ];

        setPosition(nextPosition);
        setError("");
        setTracking(true);
      },
      (locationError) => {
        if (locationError.code === 1) {
          setError("Location permission denied. Allow location in your browser.");
        } else if (locationError.code === 3) {
          setError("Location request timed out. Please try again.");
        } else {
          setError("Location is currently unavailable.");
        }

        setTracking(false);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 15000,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);
   
  function goToMyLocation() {
    if (position) {
      map.flyTo(position, 16);
    } else {
      setError("Waiting for your location. Check browser permission.");
    }
  }

  return (
    <>
      {position && (
        <Marker position={position}>
          <Popup>
            <div>
              <strong>📍 Your Live Location</strong>
              <div>Latitude: {position[0].toFixed(6)}</div>
              <div>Longitude: {position[1].toFixed(6)}</div>
            </div>
          </Popup>
        </Marker>
      )}

      <div className="live-location-control">
        <button type="button" onClick={goToMyLocation}>
          📍 My Location
        </button>

        <span>
          {tracking ? "Live location active" : "Waiting for location"}
        </span>

        {error && <small role="status">{error}</small>}
      </div>
    </>
  );
}

// Main emergency map
export default function EmergencyMap({ reports = [] }) {
  const points = useMemo(
    () =>
      reports
        .map((report) => {
          const coords = coordinatesFor(report);

          return coords ? { ...coords, report } : null;
        })
        .filter(Boolean),
    [reports]
  );

  const defaultCenter = [24.88, 74.63];

  return (
    <section className="panel emergency-map-panel">
      <div className="panel-heading emergency-map-heading">
        <div>
          <h2>Emergency Map</h2>
          <p>Incident locations and response status</p>
        </div>

        <span className="map-count">{points.length} mapped</span>
      </div>

      <MapContainer
        className="resq-leaflet-map"
        center={defaultCenter}
        zoom={10}
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Live user location */}
        <LiveUserLocation />

        {/* Emergency markers */}
        {points.map(({ lat, lng, report }) => (
          <Marker
            key={String(
              report.id ?? report._id ?? `${lat}-${lng}`
            )}
            position={[lat, lng]}
            icon={getSeverityIcon(report.severity)}
          >
            <Popup>
              <div className="resq-map-popup">
                <strong>{report.type || "Incident"}</strong>

                <div>
                  {report.location || "Location not provided"}
                </div>

                <div>Severity: {report.severity || "Unknown"}</div>
                <div>Status: {report.status || "Unknown"}</div>

                <div className="resq-map-coords">
                  {lat.toFixed(5)}, {lng.toFixed(5)}
                </div>

                <a
                  className="map-directions-button"
                  href={`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  🧭 Get Directions
                </a>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Return to current location */}
        <LiveLocationControls />
      </MapContainer>

      {points.length === 0 && (
        <p className="map-note">
          No GPS markers yet. The map is working, but incidents need
          latitude and longitude to appear.
        </p>
      )}
    </section>
  );
}

// Separate controls component to keep the map controls accessible
function LiveLocationControls() {
  const map = useMap();
  const [userPosition, setUserPosition] = useState(null);

  useEffect(() => {
    if (!navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (result) => {
        setUserPosition([
          result.coords.latitude,
          result.coords.longitude,
        ]);
      },
      () => {},
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 15000,
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  return (
    <div className="live-location-control">
      <button
        type="button"
        onClick={() => {
          if (userPosition) {
            map.flyTo(userPosition, 16);
          }
        }}
      >
        🎯 Center on My Location
      </button>
    </div>
  );
}