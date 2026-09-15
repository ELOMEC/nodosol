"use client";

import {
  DrawingManager,
  GoogleMap,
  Marker,
  Polygon,
  useJsApiLoader,
} from "@react-google-maps/api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Shape of the geographic metadata a LocationPicker produces. Callers
 * typically stuff this into the wider metadata JSON that gets uploaded
 * to Supabase and then pointed at by an on-chain `metadata_uri`.
 */
export type LocationValue = {
  address: string;
  lat: number;
  lng: number;
  /**
   * Optional polygon tracing the property / plot boundary on the map.
   * Array of {lat, lng} vertices, order matters (the polygon is closed
   * by connecting the last vertex back to the first).
   */
  polygon?: Array<{ lat: number; lng: number }>;
};

const LIBRARIES: ("places" | "drawing" | "geometry")[] = ["places", "drawing"];
const DEFAULT_CENTER = { lat: 44.7866, lng: 20.4489 }; // Belgrade fallback
const DEFAULT_ZOOM = 12;
const DETAIL_ZOOM = 17;

const mapContainerStyle: React.CSSProperties = {
  width: "100%",
  height: 340,
  borderRadius: 10,
};

export function LocationPicker({
  value,
  onChange,
  allowPolygon = true,
}: {
  value: LocationValue | null;
  onChange: (v: LocationValue | null) => void;
  allowPolygon?: boolean;
}) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: apiKey ?? "",
    libraries: LIBRARIES,
  });

  if (!apiKey) {
    return (
      <Card>
        <div style={{ fontSize: "0.82rem", color: "#b91c1c" }}>
          Google Maps key not configured. Set{" "}
          <code>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> in{" "}
          <code>web/.env.local</code>.
        </div>
      </Card>
    );
  }
  if (loadError) {
    return (
      <Card>
        <div style={{ fontSize: "0.82rem", color: "#b91c1c" }}>
          Failed to load Google Maps SDK: {loadError.message}
        </div>
      </Card>
    );
  }
  if (!isLoaded) {
    return (
      <Card>
        <div style={{ fontSize: "0.82rem", color: "#6b7280", padding: "1rem 0", textAlign: "center" }}>
          Loading maps SDK…
        </div>
      </Card>
    );
  }
  return <Loaded value={value} onChange={onChange} allowPolygon={allowPolygon} />;
}

function Loaded({
  value,
  onChange,
  allowPolygon,
}: {
  value: LocationValue | null;
  onChange: (v: LocationValue | null) => void;
  allowPolygon: boolean;
}) {
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement | null>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const polygonRef = useRef<google.maps.Polygon | null>(null);

  // Attach Places Autocomplete to the input once the SDK is loaded.
  useEffect(() => {
    if (!searchRef.current || autocompleteRef.current) return;
    const ac = new google.maps.places.Autocomplete(searchRef.current, {
      fields: ["geometry", "formatted_address", "name"],
    });
    ac.addListener("place_changed", () => {
      const place = ac.getPlace();
      const loc = place.geometry?.location;
      if (!loc) return;
      const lat = loc.lat();
      const lng = loc.lng();
      onChange({
        address: place.formatted_address || place.name || "",
        lat,
        lng,
        polygon: value?.polygon,
      });
      if (mapRef.current) {
        mapRef.current.panTo({ lat, lng });
        mapRef.current.setZoom(DETAIL_ZOOM);
      }
    });
    autocompleteRef.current = ac;
  }, [onChange, value?.polygon]);

  const center = useMemo(() => {
    if (value) return { lat: value.lat, lng: value.lng };
    return DEFAULT_CENTER;
  }, [value]);

  const onMapClick = useCallback(
    (e: google.maps.MapMouseEvent) => {
      const lat = e.latLng?.lat();
      const lng = e.latLng?.lng();
      if (lat === undefined || lng === undefined) return;

      // Reverse geocode to get a human-readable address.
      const geocoder = new google.maps.Geocoder();
      geocoder.geocode({ location: { lat, lng } }, (results, status) => {
        const address =
          status === "OK" && results && results[0] ? results[0].formatted_address : "";
        onChange({
          address,
          lat,
          lng,
          polygon: value?.polygon,
        });
      });
    },
    [onChange, value?.polygon]
  );

  const onPolygonComplete = useCallback(
    (polygon: google.maps.Polygon) => {
      const path = polygon.getPath();
      const vertices: Array<{ lat: number; lng: number }> = [];
      for (let i = 0; i < path.getLength(); i++) {
        const p = path.getAt(i);
        vertices.push({ lat: p.lat(), lng: p.lng() });
      }
      // Remove the drawing-manager polygon; we re-render it as a controlled
      // Polygon component using the saved vertices.
      polygon.setMap(null);
      onChange({
        address: value?.address ?? "",
        lat: value?.lat ?? vertices[0]?.lat ?? DEFAULT_CENTER.lat,
        lng: value?.lng ?? vertices[0]?.lng ?? DEFAULT_CENTER.lng,
        polygon: vertices,
      });
    },
    [onChange, value]
  );

  function clearPolygon() {
    if (polygonRef.current) polygonRef.current.setMap(null);
    polygonRef.current = null;
    if (!value) return;
    onChange({ ...value, polygon: undefined });
  }

  function clearAll() {
    clearPolygon();
    onChange(null);
    setSearch("");
    if (searchRef.current) searchRef.current.value = "";
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      <div style={{ position: "relative" }}>
        <input
          ref={searchRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search for an address, apartment, or venue…"
          style={{
            width: "100%",
            padding: "0.6rem 0.75rem",
            borderRadius: 8,
            border: "1px solid var(--shell-border, #eef0f3)",
            background: "var(--shell-card, #fff)",
            color: "var(--shell-fg, #111827)",
            fontSize: "0.9rem",
          }}
        />
      </div>

      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        center={center}
        zoom={value ? DETAIL_ZOOM : DEFAULT_ZOOM}
        onClick={onMapClick}
        onLoad={(m) => {
          mapRef.current = m;
        }}
        options={{
          streetViewControl: false,
          mapTypeControl: true,
          fullscreenControl: true,
          gestureHandling: "greedy",
        }}
      >
        {value && (
          <Marker
            position={{ lat: value.lat, lng: value.lng }}
            draggable
            onDragEnd={(e) => {
              const lat = e.latLng?.lat();
              const lng = e.latLng?.lng();
              if (lat === undefined || lng === undefined) return;
              onChange({
                address: value.address,
                lat,
                lng,
                polygon: value.polygon,
              });
            }}
          />
        )}
        {value?.polygon && value.polygon.length >= 3 && (
          <Polygon
            path={value.polygon}
            options={{
              fillColor: "#4f46e5",
              fillOpacity: 0.25,
              strokeColor: "#4338ca",
              strokeWeight: 2,
            }}
            onLoad={(p) => {
              polygonRef.current = p;
            }}
          />
        )}
        {allowPolygon && !value?.polygon && (
          <DrawingManager
            onPolygonComplete={onPolygonComplete}
            options={{
              drawingControl: true,
              drawingControlOptions: {
                position: google.maps.ControlPosition.TOP_CENTER,
                drawingModes: [google.maps.drawing.OverlayType.POLYGON],
              },
              polygonOptions: {
                fillColor: "#4f46e5",
                fillOpacity: 0.25,
                strokeColor: "#4338ca",
                strokeWeight: 2,
                editable: true,
              },
            }}
          />
        )}
      </GoogleMap>

      {value ? (
        <div
          style={{
            background: "var(--shell-pill-bg, #f7f8fa)",
            border: "1px solid var(--shell-border, #eef0f3)",
            borderRadius: 8,
            padding: "0.65rem 0.85rem",
            fontSize: "0.82rem",
            display: "grid",
            gap: "0.25rem",
          }}
        >
          <div style={{ fontWeight: 600 }}>
            {value.address || "(no reverse-geocoded address)"}
          </div>
          <div style={{ fontSize: "0.72rem", color: "#6b7280" }}>
            {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
            {value.polygon && ` · ${value.polygon.length}-vertex polygon`}
          </div>
          <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.3rem" }}>
            {value.polygon && (
              <button
                type="button"
                onClick={clearPolygon}
                style={{
                  padding: "0.3rem 0.65rem",
                  borderRadius: 6,
                  border: "1px solid var(--shell-border, #eef0f3)",
                  background: "var(--shell-card, #fff)",
                  color: "var(--shell-fg, #111827)",
                  fontSize: "0.74rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Remove polygon
              </button>
            )}
            <button
              type="button"
              onClick={clearAll}
              style={{
                padding: "0.3rem 0.65rem",
                borderRadius: 6,
                border: "1px solid #fecaca",
                background: "transparent",
                color: "#b91c1c",
                fontSize: "0.74rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Clear location
            </button>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>
          Search above or click on the map to drop a pin. Drag the pin to adjust.
          {allowPolygon && " Use the polygon tool above the map to trace a plot boundary."}
        </div>
      )}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "var(--shell-card, #fff)",
        border: "1px solid var(--shell-border, #eef0f3)",
        borderRadius: 10,
        padding: "0.85rem 1rem",
      }}
    >
      {children}
    </div>
  );
}
