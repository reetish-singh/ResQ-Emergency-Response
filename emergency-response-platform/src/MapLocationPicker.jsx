import { useState } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./map.css";

const pickerIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

function ClickToChoose({ onChoose }) {
  useMapEvents({
    click(event) {
      onChoose({ latitude: Number(event.latlng.lat.toFixed(6)), longitude: Number(event.latlng.lng.toFixed(6)) });
    },
  });
  return null;
}

export default function MapLocationPicker({ latitude, longitude, onChange, defaultCenter = [24.88, 74.63] }) {
  const [geoError, setGeoError] = useState("");
  const hasCoordinates = latitude !== "" && latitude != null && longitude !== "" && longitude != null &&
    Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude));
  const position = hasCoordinates ? [Number(latitude), Number(longitude)] : defaultCenter;

  function useMyLocation() {
    setGeoError("");
    if (!navigator.geolocation) {
      setGeoError("This browser does not support location access.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (result) => onChange({
        latitude: Number(result.coords.latitude.toFixed(6)),
        longitude: Number(result.coords.longitude.toFixed(6)),
      }),
      (error) => setGeoError(error.code === 1
        ? "Location permission was denied. Select a point on the map instead."
        : "Could not get your location. Select a point on the map instead."),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }

  return (
    <div className="resq-location-picker">
      <div className="resq-picker-toolbar">
        <p>Click the map to choose the incident location.</p>
        <button type="button" className="secondary-button" onClick={useMyLocation}>Use my current location</button>
      </div>
      <MapContainer center={position} zoom={hasCoordinates ? 15 : 10} className="resq-leaflet-map resq-picker-map">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickToChoose onChoose={onChange} />
        {hasCoordinates && <Marker position={position} icon={pickerIcon} />}
      </MapContainer>
      {hasCoordinates && <p className="resq-coordinate-readout">Selected coordinates: {Number(latitude).toFixed(6)}, {Number(longitude).toFixed(6)}</p>}
      {geoError && <p className="map-note" role="status">{geoError}</p>}
    </div>
  );
}
