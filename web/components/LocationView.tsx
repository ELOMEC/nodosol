"use client";

import {
  GoogleMap,
  Marker,
  Polygon,
  useJsApiLoader,
} from "@react-google-maps/api";

import type { LocationValue } from "./LocationPicker";

/**
 * Read-only renderer for a location stuffed into asset / auction
 * metadata. Shows a non-interactive map pinned at the saved location
 * with the polygon boundary (if any) overlaid.
 */
export function LocationView({ location }: { location: LocationValue }) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: apiKey ?? "",
    libraries: ["geometry"],
  });

  if (!apiKey || !isLoaded) {
    // Fallback: static map image via Maps Static API (works without JS SDK).
    if (apiKey) {
      const q = `${location.lat},${location.lng}`;
      const marker = `markers=color:0x4f46e5%7C${q}`;
      const pathParam = location.polygon && location.polygon.length >= 3
        ? `&path=color:0x4338caff%7Cweight:3%7Cfillcolor:0x4f46e555%7C${location.polygon
            .map((p) => `${p.lat},${p.lng}`)
            .join("%7C")}%7C${location.polygon[0].lat},${location.polygon[0].lng}`
        : "";
      const src = `https://maps.googleapis.com/maps/api/staticmap?center=${q}&zoom=16&size=640x340&${marker}${pathParam}&key=${apiKey}`;
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={location.address}
          style={{ width: "100%", borderRadius: 10, display: "block" }}
        />
      );
    }
    return (
      <div style={{ fontSize: "0.82rem", color: "#6b7280" }}>
        Map unavailable — set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to render.
      </div>
    );
  }

  const center = { lat: location.lat, lng: location.lng };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <GoogleMap
        mapContainerStyle={{ width: "100%", height: 340, borderRadius: 10 }}
        center={center}
        zoom={16}
        options={{
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: true,
          zoomControl: true,
          gestureHandling: "cooperative",
          clickableIcons: false,
        }}
      >
        <Marker position={center} />
        {location.polygon && location.polygon.length >= 3 && (
          <Polygon
            path={location.polygon}
            options={{
              fillColor: "#4f46e5",
              fillOpacity: 0.25,
              strokeColor: "#4338ca",
              strokeWeight: 2,
              clickable: false,
            }}
          />
        )}
      </GoogleMap>
      {location.address && (
        <div style={{ fontSize: "0.82rem", color: "#374151" }}>
          📍 {location.address}
        </div>
      )}
    </div>
  );
}
