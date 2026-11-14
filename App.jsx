import { useState, useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api } from "./api";

const SEV = { Low: "#2F9E6B", Medium: "#2E6BE6", High: "#E8800F", Critical: "#D93A3A" };
const TYPES = ["pothole", "fire", "flood", "fallen tree", "smoke", "debris", "accident", "electrical hazard", "road damage"];
const P = {
  home: "M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10", plus: "M12 5v14M5 12h14", list: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  map: "M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14", bell: "M6 16v-5a6 6 0 0112 0v5l2 2H4zM10 20a2 2 0 004 0",
  user: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0", grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  users: "M9 11a3 3 0 100-6 3 3 0 000 6zM3 20a6 6 0 0112 0M17 11a3 3 0 100-6M21 20a5 5 0 00-4-5",
  alert: "M12 3l10 18H2zM12 10v5M12 18h.01", pin: "M12 21s7-6.5 7-12a7 7 0 10-14 0c0 5.5 7 12 7 12zM12 11a2 2 0 100-4 2 2 0 000 4z",
  camera: "M4 8h3l2-3h6l2 3h3v11H4zM12 16a3 3 0 100-6 3 3 0 000 6z", upload: "M12 16V4M7 9l5-5 5 5M4 20h16", check: "M5 12l5 5 9-10",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z", out: "M10 4H4v16h6M15 8l5 4-5 4M20 12H9",
  settings: "M4 7h10M18 7h2M4 17h2M10 17h10M14 5v4M6 15v4", arrow: "M5 12h14M13 6l6 6-6 6",
  fire: "M12 3c1 4 5 5 5 10a5 5 0 01-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-6 1-9z", flood: "M3 9c3-3 6 3 9 0s6 3 9 0M3 15c3-3 6 3 9 0s6 3 9 0",
  "fallen tree": "M12 3l6 9h-4l5 7H5l5-7H6zM12 19v3", smoke: "M7 18a4 4 0 010-8 5 5 0 019-1 4 4 0 011 9z",
  debris: "M3 8l9-5 9 5v8l-9 5-9-5zM3 8l9 5 9-5M12 13v8", accident: "M4 15v-4l2-5h12l2 5v4zM4 15h16M7 18h.01M17 18h.01",
  "electrical hazard": "M13 2L4 14h7l-1 8 9-12h-7z", pothole: "M8 3L4 21M16 3l4 18M12 4v3M12 10v4M12 17v3", "road damage": "M3 17l4-4 3 2 4-5 3 2 4-4M3 21h18",
};
const Ic = ({ n, s = 20 }) => (
  <svg className="ic" viewBox="0 0 24 24" width={s} height={s} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={P[n] || P.alert} /></svg>);
const cap = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());
const fmt = (t) => new Date(t).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
const ago = (t) => { const m = Math.max(0, Math.round((Date.now() - new Date(t)) / 60000)); return m < 60 ? m + " min ago" : m < 1440 ? Math.round(m / 60) + " h ago" : Math.round(m / 1440) + " d ago"; };
const dist = (a, b, c, d) => { const p = Math.PI / 180, x = Math.sin((c - a) * p / 2) ** 2 + Math.cos(a * p) * Math.cos(c * p) * Math.sin((d - b) * p / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };
const isPhone = /Android|iPhone|iPad/i.test(navigator.userAgent);
const Sev = ({ v }) => <span className="pill" style={{ background: SEV[v] }}>{v}</span>;
const Empty = ({ children }) => <div className="card empty">{children}</div>;

export default function App() {
  const [auth, setAuth] = useState(() => JSON.parse(localStorage.getItem("auth") || "null"));
  const [page, setPage] = useState("home"); const [focus, setFocus] = useState(null); const [nc, setNc] = useState(0);
  const signed = (a) => { a ? localStorage.setItem("auth", JSON.stringify(a)) : localStorage.removeItem("auth"); setAuth(a); setPage(a?.role === "admin" ? "dashboard" : "home"); };
  const go = (p, f) => { setFocus(f || null); setPage(p); window.scrollTo(0, 0); };
  useEffect(() => {
    if (auth) api("/reports/nearby", { token: auth.token }).then((r) => setNc(r.filter((x) => Date.now() - new Date(x.created) < 864e5).length)).catch(() => {});
  }, [auth, page]);
  if (!auth) return <Auth onAuth={signed} />;
  const admin = auth.role === "admin";
  const nav = admin
    ? [["dashboard", "Dashboard", "grid"], ["reports", "Reports", "list"], ["map", "Map view", "map"], ["users", "Users", "users"], ["profile", "Settings", "settings"]]
    : [["home", "Home", "home"], ["report", "Report hazard", "plus"], ["mine", "My reports", "list"], ["map", "Map", "map"], ["alerts", "Notifications", "bell"], ["profile", "Profile", "user"]];
  const P_ = { auth, go, admin, focus };
  return (
    <div className="app">
      <aside>
        <div className="logo"><Ic n="shield" s={26} /><div><b>SafeRoute AI</b><small>Report hazards. Safer tomorrow.</small></div></div>
        <div className="tape" />
        <nav>{nav.map(([k, l, i]) => <button key={k} className={page === k ? "on" : ""} onClick={() => go(k)}><Ic n={i} /><span>{l}</span></button>)}</nav>
      </aside>
      <div className="col">
        <div className="top">
          <h1>{nav.find((n) => n[0] === page)?.[1]}</h1>
          <div className="row nogrow">
            {!admin && <button className="bell" aria-label="Notifications" onClick={() => go("alerts")}><Ic n="bell" />{nc > 0 && <i>{nc}</i>}</button>}
            <span className="chip">{auth.name}{admin ? " (Admin)" : ""}</span>
            <button className="ghost" onClick={() => signed(null)}><Ic n="out" s={16} /> Sign out</button>
          </div>
        </div>
        <main>
          {page === "home" && <Home {...P_} />}
          {page === "report" && <Report {...P_} />}
          {page === "mine" && <Mine {...P_} />}
          {page === "map" && <MapPage {...P_} />}
          {page === "alerts" && <Alerts {...P_} />}
          {page === "profile" && <Profile {...P_} onAuth={signed} />}
          {page === "dashboard" && <Dashboard {...P_} />}
          {page === "reports" && <AdminReports {...P_} />}
          {page === "users" && <Users {...P_} />}
        </main>
      </div>
    </div>
  );
}

function Auth({ onAuth }) {
  const [mode, setMode] = useState("login"); const [f, setF] = useState({ name: "", email: "", password: "" });
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const go = async (e) => {
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      const a = await api(mode === "register" ? "/register" : "/login", { method: "POST", body: f });
      if (mode === "admin" && a.role !== "admin") throw new Error("This account is not an admin.");
      onAuth(a);
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <div className="authwrap">
      <section className="hero-side"><div className="logo"><Ic n="shield" s={30} /><div><b>SafeRoute AI</b></div></div>
        <h2>Spot it. Report it. Get it fixed faster.</h2>
        <ul>{["Photo, camera or text reports in seconds", "AI sorts the hazard and rates how dangerous it is", "Nearby people are alerted and admins track every report"].map((t) => <li key={t}><Ic n="check" s={18} />{t}</li>)}</ul>
        <div className="tape" /></section>
      <form className="authcard" onSubmit={go}>
        <h2>{mode === "register" ? "Create your account" : mode === "admin" ? "Admin sign in" : "Welcome back"}</h2>
        <div className="seg">{[["login", "Sign in"], ["register", "Register"], ["admin", "Admin"]].map(([k, l]) => <button type="button" key={k} className={mode === k ? "on" : ""} onClick={() => { setMode(k); setErr(""); }}>{l}</button>)}</div>
        {mode === "register" && <label>Full name<input value={f.name} onChange={set("name")} /></label>}
        <label>Email<input type="email" value={f.email} onChange={set("email")} required /></label>
        <label>Password<input type="password" placeholder="At least 6 characters" value={f.password} onChange={set("password")} required /></label>
        {mode === "admin" && <p className="muted small">Default admin: admin@saferoute.com / Admin@123</p>}
        {err && <p className="err">{err}</p>}
        <button className="primary" disabled={busy}>{busy ? "Please wait..." : mode === "register" ? "Create account" : "Sign in"}</button>
      </form>
    </div>
  );
}

function MapView({ rows, focus, height = 420 }) {
  const el = useRef(), map = useRef(), layer = useRef();
  useEffect(() => {
    map.current = L.map(el.current).setView([13.0827, 80.2707], 11);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => map.current.remove();
  }, []);
  useEffect(() => {
    layer.current.clearLayers(); const pts = [];
    rows.forEach((r) => {
      L.circleMarker([r.lat, r.lng], { radius: 9, color: "#fff", weight: 2, fillColor: SEV[r.severity], fillOpacity: 1 })
        .bindPopup(`<b>${cap(r.type)}</b><br>${r.severity} - ${r.status}<br>${r.code || ""}`).addTo(layer.current);
      pts.push([r.lat, r.lng]);
    });
    if (focus) map.current.setView(focus, 16);
    else if (pts.length) map.current.fitBounds(pts, { padding: [40, 40], maxZoom: 15 });
  }, [rows, focus]);
  return <div ref={el} className="map" style={{ height }} />;
}
const Legend = () => <div className="legend">{Object.entries(SEV).map(([k, c]) => <span key={k}><i style={{ background: c }} />{k}</span>)}</div>;

function usePos() {
  const [pos, setPos] = useState(null);
  const locate = () => navigator.geolocation?.getCurrentPosition(
    (p) => setPos({ lat: p.coords.latitude.toFixed(5), lng: p.coords.longitude.toFixed(5), auto: true }),
    () => setPos((x) => x || { lat: "", lng: "", auto: false }), { enableHighAccuracy: true, timeout: 8000 });
  useEffect(() => { locate(); if (!navigator.geolocation) setPos({ lat: "", lng: "", auto: false }); }, []);
  return [pos, setPos, locate];
}

function Home({ auth, go }) {
  const [near, setNear] = useState([]); const [mine, setMine] = useState([]);
  useEffect(() => { api("/reports/nearby", { token: auth.token }).then(setNear).catch(() => {}); api("/reports/mine", { token: auth.token }).then(setMine).catch(() => {}); }, []);
  const stats = [["My reports", mine.length, "list"], ["Active hazards", near.length, "alert"], ["Critical or high", near.filter((r) => ["Critical", "High"].includes(r.severity)).length, "fire"], ["Verified", near.filter((r) => r.verified).length, "shield"]];
  return (<>
    <section className="hero">
      <div><h2>Hello, {auth.name.split(" ")[0]}</h2><p>See something dangerous on the road? Add a photo or a short description and we will classify it, rate its severity and alert people nearby.</p>
        <div className="row nogrow"><button className="primary" onClick={() => go("report")}><Ic n="plus" s={18} /> Report a hazard</button><button className="ghost light" onClick={() => go("map")}>View map</button></div></div>
      <svg viewBox="0 0 320 200" className="art" aria-hidden="true"><rect width="320" height="200" rx="16" fill="#12305A" /><path d="M120 200L145 70h30l25 130z" fill="#1E3F6E" /><path d="M160 80v14M160 108v18M160 142v24" stroke="#FFB81C" strokeWidth="4" strokeLinecap="round" />
        <ellipse cx="160" cy="150" rx="26" ry="9" fill="#0B1F3A" /><path d="M232 150l22-40 22 40z" fill="#FFB81C" /><path d="M254 124v14M254 144h.01" stroke="#0B1F3A" strokeWidth="3" strokeLinecap="round" /><circle cx="60" cy="48" r="22" fill="#1D5FE0" opacity=".5" /></svg>
    </section>
    <div className="stats">{stats.map(([l, v, i]) => <div className="stat" key={l}><Ic n={i} s={22} /><div><b>{v}</b><span>{l}</span></div></div>)}</div>
    <h3 className="sec">What can you report</h3>
    <div className="tiles">{TYPES.map((t) => <button key={t} className="tile" onClick={() => go("report")}><Ic n={t} s={26} />{cap(t)}</button>)}</div>
    <h3 className="sec">Recent alerts</h3>
    {near.length ? <div className="feed">{near.slice(0, 4).map((r) => <FeedItem key={r.id} r={r} go={go} />)}</div> : <Empty>No active hazards right now.</Empty>}
  </>);
}

function FeedItem({ r, go, here }) {
  const d = here?.lat ? dist(+here.lat, +here.lng, r.lat, r.lng) : null;
  return (
    <button className="feeditem" onClick={() => go("map", [r.lat, r.lng])}>
      <span className="fi" style={{ background: SEV[r.severity] }}><Ic n={r.type} /></span>
      <span><b>{cap(r.type)} reported</b><small>{r.code} - {ago(r.created)}{d != null ? ` - ${d.toFixed(1)} km away` : ""}</small></span><Sev v={r.severity} />
    </button>);
}

function Camera({ onShot, onClose }) {
  const v = useRef(); const [e, setE] = useState("");
  useEffect(() => {
    let s;
    if (!navigator.mediaDevices?.getUserMedia) { setE("Live camera needs https or localhost. Use Upload instead."); return; }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }).then((st) => { s = st; v.current.srcObject = st; })
      .catch(() => setE("Camera is blocked or missing. Allow camera access in your browser, or use Upload."));
    return () => s?.getTracks().forEach((t) => t.stop());
  }, []);
  const snap = () => {
    const c = document.createElement("canvas"); c.width = v.current.videoWidth; c.height = v.current.videoHeight; c.getContext("2d").drawImage(v.current, 0, 0);
    c.toBlob((b) => { onShot(new File([b], "camera.jpg", { type: "image/jpeg" })); onClose(); }, "image/jpeg", 0.9);
  };
  return (<div className="modal"><div className="card">{e ? <p className="err">{e}</p> : <video ref={v} autoPlay playsInline muted />}
    <div className="row"><button className="primary" onClick={snap} disabled={!!e}>Take photo</button><button className="ghost" onClick={onClose}>Cancel</button></div></div></div>);
}

const STEPS = ["Input", "Processing", "Detection", "Severity", "Location", "Saved"];
const IMG_STEPS = ["Resizing image", "Enhancing image quality", "Removing noise", "Preparing for model inference"];
const TXT_STEPS = ["Cleaning text", "Tokenization", "Removing stop words", "Preparing for classification"];
const Checks = ({ items, prog }) => <ul className="checks">{items.map((t, i) => <li key={t} className={prog >= ((i + 1) * 100) / items.length ? "done" : ""}><Ic n="check" s={16} />{t}</li>)}</ul>;

function Report({ auth, go }) {
  const [step, setStep] = useState(1); const [mode, setMode] = useState("image");
  const [file, setFile] = useState(null); const [preview, setPreview] = useState(""); const [text, setText] = useState("");
  const [pos, setPos, locate] = usePos(); const [err, setErr] = useState(""); const [cam, setCam] = useState(false);
  const [an, setAn] = useState(null); const [prog, setProg] = useState(0); const [saved, setSaved] = useState(null); const [busy, setBusy] = useState(false);
  const up = useRef(), snap = useRef(); const when = useRef(new Date());
  useEffect(() => { if (step !== 2) return; const t = setInterval(() => setProg((p) => Math.min(100, p + 4)), 90); return () => clearInterval(t); }, [step]);
  useEffect(() => { if (step === 2 && an && prog >= 100) setStep(3); }, [step, an, prog]);
  const pick = (f) => { if (f) { setFile(f); setPreview(URL.createObjectURL(f)); } };
  const analyse = async () => {
    setErr("");
    const lat = parseFloat(pos?.lat), lng = parseFloat(pos?.lng);
    if (mode === "image" && !file) return setErr("Choose a photo, or take one with the camera.");
    if (mode === "text" && text.trim().length < 3) return setErr("Describe the hazard in a few words.");
    if (isNaN(lat) || isNaN(lng)) return setErr("Location is missing. Allow location access or type the coordinates.");
    const f = new FormData(); f.append("lat", lat); f.append("lng", lng); f.append("description", text.trim());
    if (mode === "image") f.append("image", file, file.name || "photo.jpg");
    setAn(null); setProg(0); setStep(2); when.current = new Date();
    try { setAn(await api("/reports/analyze", { method: "POST", form: f, token: auth.token })); } catch (e) { setErr(e.message); setStep(1); }
  };
  const save = async () => {
    setBusy(true); setErr("");
    try { setSaved(await api("/reports/confirm", { method: "POST", body: { id: an.id }, token: auth.token })); setStep(6); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const reset = () => { setStep(1); setFile(null); setPreview(""); setText(""); setAn(null); setSaved(null); };
  const lat = parseFloat(pos?.lat), lng = parseFloat(pos?.lng);
  return (<div>
    <ol className="stepper">{STEPS.map((s, i) => <li key={s} className={step === i + 1 ? "cur" : step > i + 1 ? "past" : ""}><span>{step > i + 1 ? <Ic n="check" s={14} /> : i + 1}</span><em>{s}</em></li>)}</ol>
    {step === 1 && <div className="card">
      <h2>Report a hazard</h2><p className="muted">Upload an image or enter a text description of the hazard.</p>
      <div className="seg"><button className={mode === "image" ? "on" : ""} onClick={() => setMode("image")}>Image upload</button><button className={mode === "text" ? "on" : ""} onClick={() => setMode("text")}>Text description</button></div>
      {mode === "image" && <>
        <div className="drop" onClick={() => up.current.click()}>{preview ? <img src={preview} alt="Hazard preview" /> : <div><Ic n="upload" s={34} /><b>Click to upload image</b><p className="muted small">JPG, PNG or WEBP</p></div>}</div>
        <div className="row"><button className="ghost" onClick={() => up.current.click()}><Ic n="upload" s={18} /> Upload photo</button>
          <button className="ghost" onClick={() => (isPhone ? snap.current.click() : setCam(true))}><Ic n="camera" s={18} /> Use camera</button></div>
        <input ref={up} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files[0])} />
        <input ref={snap} type="file" accept="image/*" capture="environment" hidden onChange={(e) => pick(e.target.files[0])} /></>}
      <textarea maxLength={200} rows={3} placeholder={mode === "image" ? "Add a note (optional)" : "Example: There is a big pothole near the bus stop, dangerous for two wheelers"} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="loc"><b><Ic n="pin" s={16} /> Location {pos?.auto ? "(auto-detected)" : ""}</b>
        <div className="row"><input placeholder="Latitude" value={pos?.lat ?? ""} onChange={(e) => setPos({ ...pos, lat: e.target.value, auto: false })} /><input placeholder="Longitude" value={pos?.lng ?? ""} onChange={(e) => setPos({ ...pos, lng: e.target.value, auto: false })} /><button className="ghost" onClick={locate}>Detect</button></div></div>
      {err && <p className="err">{err}</p>}
      <button className="primary" onClick={analyse}>Submit report</button>
      {cam && <Camera onShot={pick} onClose={() => setCam(false)} />}
    </div>}
    {step === 2 && <div className="card"><h2>Processing your report</h2><p className="muted">We are analysing the input with AI.</p>
      <div className="two">
        {mode === "image" && <div><img className="pv" src={preview} alt="" /><h4>Image processing</h4><Checks items={IMG_STEPS} prog={prog} /></div>}
        <div>{text && <blockquote>{text}</blockquote>}<h4>Text processing</h4><Checks items={TXT_STEPS} prog={text ? prog : 0} />{!text && <p className="muted small">No text provided, so only the image is analysed.</p>}</div></div>
      <div className="bar"><i style={{ width: prog + "%" }} /></div><p className="muted small">{an ? (prog >= 100 ? "Processing complete" : "Finishing up...") : "Analysing..."}</p></div>}
    {step === 3 && an && <div className="card"><h2>AI analysis results</h2>
      <div className="two">{an.image_url && <img className="pv" src={an.image_url} alt={an.type} />}
        <div className="detect"><span className="muted small">Detected hazard</span><div className="big"><Ic n={an.type} s={28} />{cap(an.type)}</div>
          <span className="muted small">AI confidence</span><div className="bar"><i style={{ width: an.confidence * 100 + "%" }} /></div><b>{Math.round(an.confidence * 100)}%</b>
          <span className="muted small">Other possible hazards</span><div className="row nogrow">{an.others.map((o) => <span key={o} className="tag">{cap(o)}</span>)}</div>
          <p className="muted small">{an.engine === "yolo" ? "Detected with the YOLO model." : an.engine === "heuristic" ? "Estimated from image colours and your text. Add a trained YOLO model for accurate detection." : "Classified from your text description."}</p></div></div>
      <button className="primary" onClick={() => setStep(4)}>Next: severity assessment <Ic n="arrow" s={18} /></button></div>}
    {step === 4 && an && <div className="card"><h2>Severity assessment</h2><p className="muted">Based on hazard type, size and potential impact.</p>
      <div className="sevbox" style={{ borderColor: SEV[an.severity] }}><Ic n="alert" s={30} /><div><b style={{ color: SEV[an.severity] }}>{an.severity}</b><small>Severity level</small></div></div>
      <div className="scale">{Object.keys(SEV).map((k) => <i key={k} style={{ background: SEV[k], opacity: k === an.severity ? 1 : .25 }} />)}</div>
      <table className="kv"><tbody><tr><td>Hazard type</td><td>{cap(an.type)}</td></tr><tr><td>Size</td><td>{an.size}</td></tr><tr><td>Impact</td><td>{an.impact}</td></tr><tr><td>AI confidence</td><td>{Math.round(an.confidence * 100)}%</td></tr></tbody></table>
      <button className="primary" onClick={() => setStep(5)}>Next: location and verification <Ic n="arrow" s={18} /></button></div>}
    {step === 5 && an && <div className="card"><h2>Location and verification</h2><p className="muted">We captured the location and checked for duplicates.</p>
      <div className="two"><div><MapView rows={[{ lat, lng, severity: an.severity, type: an.type, status: "New", code: "" }]} focus={[lat, lng]} height={260} />
        <table className="kv"><tbody><tr><td>Latitude</td><td>{lat.toFixed(5)}</td></tr><tr><td>Longitude</td><td>{lng.toFixed(5)}</td></tr><tr><td>Time</td><td>{fmt(when.current)}</td></tr></tbody></table></div>
        <div><div className="note"><h4>Duplicate check</h4><p>{an.duplicate ? `A similar ${an.type} report (${an.duplicate.code}) exists within 500 m in the last 2 hours. Your report will confirm it.` : "No similar reports found within 500 m in the last 2 hours."}</p></div>
          <div className="note"><h4>Verification status</h4><p>{an.duplicate ? `Verified, confirmed by ${an.duplicate.confirms + 1} reports.` : "Single report, awaiting more confirmations."}</p></div></div></div>
      {err && <p className="err">{err}</p>}<button className="primary" onClick={save} disabled={busy}>{busy ? "Saving..." : "Save and notify nearby users"}</button></div>}
    {step === 6 && saved && <div className="card"><div className="ok"><Ic n="check" s={28} /></div><h2>Report saved successfully</h2><p className="muted">The hazard is stored and nearby users can now see the alert.</p>
      <table className="kv"><tbody><tr><td>Report ID</td><td>{saved.code}</td></tr><tr><td>Hazard type</td><td>{cap(saved.type)}</td></tr><tr><td>Severity</td><td><Sev v={saved.severity} /></td></tr><tr><td>Location</td><td>{saved.lat.toFixed(4)}, {saved.lng.toFixed(4)}</td></tr><tr><td>Time</td><td>{fmt(saved.created)}</td></tr><tr><td>Verification</td><td>{saved.verified ? "Verified" : "Awaiting confirmation"}</td></tr></tbody></table>
      <div className="row"><button className="primary" onClick={() => go("map", [saved.lat, saved.lng])}>View on map</button><button className="ghost" onClick={() => go("home")}>Back to home</button><button className="ghost" onClick={reset}>Report another</button></div></div>}
  </div>);
}

function ReportCard({ r, go }) {
  return (<div className="rcard">{r.image_url ? <img src={r.image_url} alt={r.type} /> : <div className="noimg"><Ic n={r.type} s={34} /></div>}
    <div className="rbody"><div className="row between"><h3>{cap(r.type)}</h3><Sev v={r.severity} /></div>
      <p className="muted small">{r.code} - {fmt(r.created)}</p>
      <p className="small">Confidence {Math.round(r.confidence * 100)}% - {r.verified ? `Verified by ${r.confirms} reports` : "Awaiting confirmation"} - <b>{r.status}</b></p>
      {r.description && <p className="small">{r.description}</p>}
      <button className="link" onClick={() => go("map", [r.lat, r.lng])}><Ic n="pin" s={14} /> {r.lat.toFixed(4)}, {r.lng.toFixed(4)}</button></div></div>);
}
function useLoad(path, token, every) {
  const [rows, setRows] = useState(null); const [err, setErr] = useState("");
  const load = () => api(path, { token }).then(setRows).catch((e) => setErr(e.message));
  useEffect(() => { load(); if (every) { const t = setInterval(load, every); return () => clearInterval(t); } }, [path]);
  return [rows, err, load];
}
function Mine({ auth, go }) {
  const [rows, err] = useLoad("/reports/mine", auth.token); const [st, setSt] = useState("All");
  if (err) return <p className="err">{err}</p>; if (!rows) return <p className="muted">Loading...</p>;
  const shown = rows.filter((r) => st === "All" || r.status === st);
  return (<><div className="seg fit">{["All", "Active", "In Progress", "Resolved"].map((s) => <button key={s} className={st === s ? "on" : ""} onClick={() => setSt(s)}>{s}</button>)}</div>
    {shown.length ? <div className="grid">{shown.map((r) => <ReportCard key={r.id} r={r} go={go} />)}</div> : <Empty>No reports here yet. Use Report hazard to add your first one.</Empty>}</>);
}
function MapPage({ auth, admin, focus }) {
  const [rows, err] = useLoad(admin ? "/admin/reports" : "/reports/nearby", auth.token, 15000); const [t, setT] = useState("all");
  const shown = (rows || []).filter((r) => r.status !== "Resolved" && (t === "all" || r.type === t));
  return (<div className="card"><div className="row between"><select value={t} onChange={(e) => setT(e.target.value)} style={{ maxWidth: 220 }}><option value="all">All hazard types</option>{TYPES.map((x) => <option key={x} value={x}>{cap(x)}</option>)}</select><Legend /></div>
    {err && <p className="err">{err}</p>}<MapView rows={shown} focus={focus} height={520} /><p className="muted small">{shown.length} active hazards shown. Tap a marker for details.</p></div>);
}
function Alerts({ auth, go }) {
  const [rows, err] = useLoad("/reports/nearby", auth.token, 15000); const [pos] = usePos();
  if (err) return <p className="err">{err}</p>; if (!rows) return <p className="muted">Loading...</p>;
  return rows.length ? <div className="feed">{rows.map((r) => <FeedItem key={r.id} r={r} go={go} here={pos} />)}</div> : <Empty>You have no notifications. Nearby hazards will appear here.</Empty>;
}
function Profile({ auth, onAuth }) {
  const [me, setMe] = useState(null); const [name, setName] = useState(""); const [pw, setPw] = useState(""); const [msg, setMsg] = useState(""); const [err, setErr] = useState("");
  useEffect(() => { api("/me", { token: auth.token }).then((m) => { setMe(m); setName(m.name); }).catch((e) => setErr(e.message)); }, []);
  const save = async (e) => {
    e.preventDefault(); setErr(""); setMsg("");
    try { const m = await api("/me", { method: "PUT", body: { name, password: pw }, token: auth.token }); setMe(m); setPw(""); setMsg("Changes saved."); localStorage.setItem("auth", JSON.stringify({ ...auth, name: m.name })); }
    catch (x) { setErr(x.message); }
  };
  if (!me) return err ? <p className="err">{err}</p> : <p className="muted">Loading...</p>;
  return (<form className="card narrow" onSubmit={save}><div className="avatar">{me.name[0]}</div><h2>{me.name}</h2><p className="muted">{me.email} - {me.role === "admin" ? "Administrator" : "Member"} - {me.reports} reports</p>
    <label>Full name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
    <label>New password<input type="password" placeholder="Leave blank to keep current" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
    {err && <p className="err">{err}</p>}{msg && <p className="okmsg">{msg}</p>}<button className="primary">Save changes</button></form>);
}

function Table({ rows, onStatus, go }) {
  return (<div className="tw"><table className="tbl"><thead><tr><th>ID</th><th>Type</th><th>Severity</th><th>Location</th><th>Time</th><th>Status</th><th></th></tr></thead>
    <tbody>{rows.map((r) => <tr key={r.id}><td>{r.code}</td><td><span className="ty"><Ic n={r.type} s={16} />{cap(r.type)}</span></td><td><Sev v={r.severity} /></td><td>{r.lat.toFixed(4)}, {r.lng.toFixed(4)}</td><td>{fmt(r.created)}</td>
      <td><select value={r.status} onChange={(e) => onStatus(r.id, e.target.value)}><option>Active</option><option>In Progress</option><option>Resolved</option></select></td>
      <td><button className="ghost sm" onClick={() => go("map", [r.lat, r.lng])}>View</button></td></tr>)}</tbody></table></div>);
}
function useAdmin(auth) {
  const [rows, err, load] = useLoad("/admin/reports", auth.token, 10000);
  const setStatus = async (id, status) => { await api("/admin/reports/" + id, { method: "PATCH", body: { status }, token: auth.token }); load(); };
  return [rows, err, setStatus];
}
function Dashboard({ auth, go }) {
  const [rows, err, setStatus] = useAdmin(auth);
  if (err) return <p className="err">{err}</p>; if (!rows) return <p className="muted">Loading...</p>;
  const act = rows.filter((r) => r.status !== "Resolved"); const c = (s) => act.filter((r) => r.severity === s).length;
  return (<>
    <div className="stats">{[["Total active", act.length, "#0B1F3A"], ["Critical", c("Critical"), SEV.Critical], ["High", c("High"), SEV.High], ["Medium", c("Medium"), SEV.Medium], ["Low", c("Low"), SEV.Low]].map(([l, v, col]) => <div key={l} className="stat" style={{ borderTop: `4px solid ${col}` }}><div><b>{v}</b><span>{l}</span></div></div>)}</div>
    <div className="two wide"><div className="card"><h3>Recent reports</h3>{rows.length ? <Table rows={rows.slice(0, 6)} onStatus={setStatus} go={go} /> : <p className="muted">No reports yet.</p>}</div>
      <div className="card"><h3>Hazard locations</h3><MapView rows={act} height={300} /><Legend /></div></div></>);
}
function AdminReports({ auth, go }) {
  const [rows, err, setStatus] = useAdmin(auth); const [sev, setSev] = useState("All"); const [t, setT] = useState("all");
  if (err) return <p className="err">{err}</p>; if (!rows) return <p className="muted">Loading...</p>;
  const shown = rows.filter((r) => (sev === "All" || r.severity === sev) && (t === "all" || r.type === t));
  return (<div className="card"><div className="row"><div className="seg fit">{["All", "Critical", "High", "Medium", "Low"].map((s) => <button key={s} className={sev === s ? "on" : ""} onClick={() => setSev(s)}>{s}</button>)}</div>
    <select value={t} onChange={(e) => setT(e.target.value)} style={{ maxWidth: 220 }}><option value="all">All hazard types</option>{TYPES.map((x) => <option key={x} value={x}>{cap(x)}</option>)}</select></div>
    {shown.length ? <Table rows={shown} onStatus={setStatus} go={go} /> : <p className="muted">No reports match these filters.</p>}</div>);
}
function Users({ auth }) {
  const [rows, err] = useLoad("/admin/users", auth.token);
  if (err) return <p className="err">{err}</p>; if (!rows) return <p className="muted">Loading...</p>;
  return (<div className="card tw"><table className="tbl"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Reports</th></tr></thead><tbody>{rows.map((u) => <tr key={u.id}><td>{u.name}</td><td>{u.email}</td><td>{u.role === "admin" ? "Administrator" : "Member"}</td><td>{u.reports}</td></tr>)}</tbody></table></div>);
}
