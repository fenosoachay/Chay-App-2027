import React, { useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Carte des membres (tableau de bord admin, 1.3.25) : un rond avec la photo de profil par ville (position arrondie
// à ~5 km envoyée par l'app). Plusieurs membres dans la même ville : la première photo et le nombre en plus.
const echapper = (t) => String(t || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const initiales = (nom) => String(nom || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((m) => m[0]).join("").toUpperCase();
const photoSure = (url) => (/^https:\/\/[^\s"'<>]+$/i.test(String(url || "")) ? url : "");

function icone(groupe) {
  const m = groupe.membres[0];
  const photo = photoSure(m.photo);
  const rond = photo
    ? `<img src="${echapper(photo)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:9999px" />`
    : `<span style="display:grid;place-items:center;width:100%;height:100%;border-radius:9999px;background:linear-gradient(135deg,#4A6CFE,#8A56E2);color:#fff;font:700 14px system-ui">${echapper(initiales(m.nom))}</span>`;
  const plus = groupe.membres.length > 1
    ? `<span style="position:absolute;right:-6px;top:-6px;min-width:20px;height:20px;padding:0 5px;border-radius:9999px;background:#FF57B2;color:#fff;font:700 11px/20px system-ui;text-align:center;box-shadow:0 0 0 2px #fff">+${groupe.membres.length - 1}</span>`
    : "";
  return L.divIcon({
    className: "",
    html: `<div style="position:relative;width:44px;height:44px;border-radius:9999px;box-shadow:0 0 0 3px #fff,0 4px 12px rgba(0,0,0,.35)">${rond}${plus}</div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -24],
  });
}

export default function CarteMembres({ points }) {
  const groupes = useMemo(() => {
    const m = new Map();
    for (const p of points || []) {
      const cle = `${p.lat},${p.lon}`;
      if (!m.has(cle)) m.set(cle, { lat: p.lat, lon: p.lon, membres: [] });
      m.get(cle).membres.push(p);
    }
    return [...m.values()];
  }, [points]);

  const bornes = useMemo(() => {
    if (!groupes.length) return null;
    return L.latLngBounds(groupes.map((g) => [g.lat, g.lon])).pad(0.3);
  }, [groupes]);

  return (
    <MapContainer
      {...(bornes ? { bounds: bornes, maxZoom: 11 } : { center: [10, 25], zoom: 2 })}
      scrollWheelZoom={false}
      className="h-[420px] w-full rounded-[1.25rem] z-0"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {groupes.map((g) => (
        <Marker key={`${g.lat},${g.lon}`} position={[g.lat, g.lon]} icon={icone(g)}>
          <Popup>
            <div className="max-h-48 space-y-1 overflow-y-auto">
              {g.membres.map((m) => (
                <div key={m.id} className="flex items-center gap-2">
                  {photoSure(m.photo)
                    ? <img src={photoSure(m.photo)} alt="" className="h-7 w-7 rounded-full object-cover" />
                    : <span className="grid h-7 w-7 place-items-center rounded-full bg-primary text-xs font-bold text-white">{initiales(m.nom)}</span>}
                  <span className="text-sm font-semibold">{m.nom}</span>
                </div>
              ))}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
