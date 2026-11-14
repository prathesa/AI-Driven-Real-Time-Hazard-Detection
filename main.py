"""SafeRoute AI backend (FastAPI + SQLite). Run: uvicorn main:app --reload --host 0.0.0.0 --port 8000"""
import os, io, json, time, hmac, hashlib, base64, sqlite3, math, uuid
from datetime import datetime, timezone, timedelta
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from PIL import Image, ImageOps
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline

BASE = os.path.dirname(os.path.abspath(__file__))
UP = os.path.join(BASE, "uploads"); os.makedirs(UP, exist_ok=True)
SECRET = os.environ.get("SECRET", "change-this-secret")

# ---------- database ----------
db = sqlite3.connect(os.path.join(BASE, "hazards.db"), check_same_thread=False)
db.row_factory = sqlite3.Row
db.executescript("""
create table if not exists users(id integer primary key autoincrement, name text, email text unique, pw text, role text default 'user');
create table if not exists reports(id integer primary key autoincrement, code text, user_id integer, user_name text,
  type text, severity text, confidence real, lat real, lng real, description text, image text,
  status text default 'Active', confirms integer default 1, dup_of integer, engine text, created text);
""")

def hash_pw(p, salt=None):
    salt = salt or os.urandom(8).hex()
    return salt + "$" + hashlib.pbkdf2_hmac("sha256", p.encode(), salt.encode(), 100000).hex()

def check_pw(p, h): return hmac.compare_digest(hash_pw(p, h.split("$")[0]), h)

if not db.execute("select 1 from users where role='admin'").fetchone():
    db.execute("insert into users(name,email,pw,role) values('Admin','admin@saferoute.com',?,'admin')", (hash_pw("Admin@123"),))
    db.commit()

def sign(body): return hmac.new(SECRET.encode(), body.encode(), hashlib.sha256).hexdigest()

def make_token(u):
    body = base64.urlsafe_b64encode(json.dumps({"id": u["id"], "role": u["role"], "exp": time.time() + 7 * 86400}).encode()).decode()
    return body + "." + sign(body)

def current(authorization: str = Header(None)):
    try:
        body, sig = authorization.split(" ")[1].split(".")
        if not hmac.compare_digest(sig, sign(body)): raise ValueError
        d = json.loads(base64.urlsafe_b64decode(body))
        if d["exp"] < time.time(): raise ValueError
        return d
    except Exception:
        raise HTTPException(401, "Please sign in again.")

def admin_only(u=Depends(current)):
    if u["role"] != "admin": raise HTTPException(403, "Admin access only.")
    return u

# ---------- AI: text classifier (TF-IDF + Logistic Regression) ----------
DATA = {
 "pothole": ["big pothole on the road", "hole in the road dangerous for bikes", "deep pit in the road near bus stop"],
 "fire": ["fire burning near the building", "flames in the shop", "something is on fire"],
 "flood": ["water logging flooded street", "road is flooded with water", "flood water entering houses"],
 "fallen tree": ["tree fell on the road", "fallen tree blocking the way", "uprooted tree on the street"],
 "smoke": ["thick smoke coming from the area", "black smoke in the air", "smoke from burning garbage"],
 "debris": ["debris and garbage on the road", "broken bricks and waste blocking path", "construction debris on street"],
 "accident": ["two vehicles crashed accident", "bike accident injured person", "car collision on highway"],
 "electrical hazard": ["live wire hanging", "electric pole sparking", "transformer sparking cables fallen"],
 "road damage": ["road cracked and damaged", "broken road surface", "road collapsed"],
}
X, y = [], []
for k, v in DATA.items():
    for s in v: X.append(s); y.append(k)
text_model = make_pipeline(TfidfVectorizer(ngram_range=(1, 2)), LogisticRegression(C=20, max_iter=2000)).fit(X, y)

def classify_text(t):
    p = text_model.predict_proba([t.lower()])[0]; i = int(p.argmax())
    return text_model.classes_[i], float(p[i])

# ---------- AI: image classifier (YOLO if best.pt exists, else colour heuristic) ----------
YOLO = None
try:
    if os.path.exists(os.path.join(BASE, "best.pt")):
        from ultralytics import YOLO as _Y
        YOLO = _Y(os.path.join(BASE, "best.pt"))
except Exception as e:
    print("YOLO not loaded:", e)

def classify_image(path):
    if YOLO is not None:
        r = YOLO(path, verbose=False)[0]
        if len(r.boxes):
            b = max(r.boxes, key=lambda b: float(b.conf))
            return r.names[int(b.cls)].replace("_", " ").lower(), float(b.conf), "yolo"
    a = np.asarray(Image.open(path).convert("RGB").resize((160, 160))).astype(float)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx, mn = a.max(-1), a.min(-1); sat = (mx - mn) / (mx + 1); n = r.size
    fire = ((r > 180) & (r > g + 40) & (g > 60) & (b < 110)).sum() / n
    water = ((b > r + 15) & (b > g) & (sat > .18)).sum() / n
    grey = ((sat < .12) & (mx > 90) & (mx < 210)).sum() / n
    dark = (mx < 70).sum() / n
    if fire > .08: return "fire", min(.9, .5 + fire * 2), "heuristic"
    if water > .35: return "flood", .55, "heuristic"
    if grey > .75 and dark < .05: return "smoke", .5, "heuristic"
    if dark > .12: return "pothole", .55, "heuristic"
    return "road damage", .4, "heuristic"

# ---------- severity ----------
BASE_SEV = {"fire": 3, "electrical hazard": 3, "accident": 3, "flood": 2, "smoke": 2, "fallen tree": 2, "pothole": 1, "road damage": 1, "debris": 0}
LEVELS = ["Low", "Medium", "High", "Critical"]
BOOST = ("big", "huge", "large", "deep", "children", "school", "injured", "blocked", "spreading", "live", "dangerous")

def severity(t, conf, text):
    s = BASE_SEV.get(t, 1)
    if any(w in text.lower() for w in BOOST): s += 1
    if conf < .45: s -= 1
    return LEVELS[max(0, min(3, s))]

def km(a, b, c, d):
    p = math.pi / 180
    x = math.sin((c - a) * p / 2) ** 2 + math.cos(a * p) * math.cos(c * p) * math.sin((d - b) * p / 2) ** 2
    return 12742 * math.asin(math.sqrt(x))

def row(r):
    d = dict(r); d["verified"] = d["confirms"] >= 2
    d["image_url"] = "/uploads/" + d["image"] if d["image"] else None
    return d

# ---------- app ----------
app = FastAPI(title="SafeRoute AI")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.mount("/uploads", StaticFiles(directory=UP), name="uploads")

class Cred(BaseModel):
    name: str = ""
    email: str
    password: str

class Status(BaseModel):
    status: str

def session(u): return {"token": make_token(u), "name": u["name"], "role": u["role"], "email": u["email"]}

@app.get("/api/health")
def health(): return {"ok": True, "yolo": YOLO is not None}

@app.post("/api/register")
def register(c: Cred):
    email = c.email.strip().lower()
    if "@" not in email: raise HTTPException(400, "Enter a valid email address.")
    if len(c.password) < 6: raise HTTPException(400, "Password must be at least 6 characters.")
    if not c.name.strip(): raise HTTPException(400, "Enter your name.")
    if db.execute("select 1 from users where email=?", (email,)).fetchone():
        raise HTTPException(400, "That email is already registered. Sign in instead.")
    cur = db.execute("insert into users(name,email,pw) values(?,?,?)", (c.name.strip(), email, hash_pw(c.password))); db.commit()
    return session(dict(db.execute("select * from users where id=?", (cur.lastrowid,)).fetchone()))

@app.post("/api/login")
def login(c: Cred):
    u = db.execute("select * from users where email=?", (c.email.strip().lower(),)).fetchone()
    if not u or not check_pw(c.password, u["pw"]): raise HTTPException(401, "Wrong email or password.")
    return session(dict(u))

ANALYSES = {}
IMPACT = {"pothole": "May cause accidents and vehicle damage", "fire": "Risk to life and property; can spread quickly",
          "flood": "Blocks roads and can enter homes", "fallen tree": "Blocks traffic and can damage power lines",
          "smoke": "Reduces visibility and harms breathing", "debris": "Obstructs the road and can cause crashes",
          "accident": "Injured people and blocked traffic likely", "electrical hazard": "Risk of electric shock and fire",
          "road damage": "Can damage vehicles and cause falls"}
RELATED = {"pothole": ["road damage", "debris"], "fire": ["smoke", "electrical hazard"], "flood": ["road damage", "debris"],
           "fallen tree": ["debris", "road damage"], "smoke": ["fire", "debris"], "debris": ["road damage", "fallen tree"],
           "accident": ["debris", "fire"], "electrical hazard": ["fire", "fallen tree"], "road damage": ["pothole", "debris"]}

class Confirm(BaseModel):
    id: str

class Profile(BaseModel):
    name: str = ""
    password: str = ""

def find_dup(htype, lat, lng, now):
    for r in db.execute("select * from reports where type=? and status!='Resolved' and dup_of is null", (htype,)):
        if km(lat, lng, r["lat"], r["lng"]) <= .5 and now - datetime.fromisoformat(r["created"]) <= timedelta(hours=2):
            return r
    return None

def others_for(htype, description):
    if description:
        p = text_model.predict_proba([description.lower()])[0]
        return [text_model.classes_[i] for i in p.argsort()[::-1] if text_model.classes_[i] != htype][:2]
    return RELATED.get(htype, [])

@app.post("/api/reports/analyze")
async def analyze(description: str = Form(""), lat: float = Form(...), lng: float = Form(...),
                  image: UploadFile = File(None), u=Depends(current)):
    description = description.strip(); fname = None; path = None
    if image is not None and image.filename:
        try:
            im = ImageOps.exif_transpose(Image.open(io.BytesIO(await image.read()))).convert("RGB")
            im.thumbnail((1280, 1280)); fname = uuid.uuid4().hex + ".jpg"; path = os.path.join(UP, fname)
            im.save(path, "JPEG", quality=88)
        except Exception:
            raise HTTPException(400, "That file is not a readable image. Use JPG, PNG or WEBP.")
    if not fname and len(description) < 3:
        raise HTTPException(400, "Add a photo or a description.")
    it = ic = None; engine = "text"
    if fname: it, ic, engine = classify_image(path)
    tt, tc = classify_text(description) if description else (None, 0)
    if fname and engine == "yolo": htype, conf = it, ic
    elif tt: htype, conf = tt, tc
    else: htype, conf = it, ic
    sev = severity(htype, conf, description)
    size = "Large" if any(w in description.lower() for w in BOOST) else "Medium"
    dup = find_dup(htype, lat, lng, datetime.now(timezone.utc))
    aid = uuid.uuid4().hex
    if len(ANALYSES) > 500: ANALYSES.pop(next(iter(ANALYSES)))
    ANALYSES[aid] = dict(user_id=u["id"], type=htype, conf=round(conf, 2), sev=sev, lat=lat, lng=lng, description=description, image=fname, engine=engine)
    return {"id": aid, "type": htype, "confidence": round(conf, 2), "severity": sev, "size": size, "impact": IMPACT.get(htype, ""),
            "others": others_for(htype, description), "image_url": "/uploads/" + fname if fname else None, "engine": engine,
            "duplicate": row(dup) if dup else None}

@app.post("/api/reports/confirm")
def confirm(b: Confirm, u=Depends(current)):
    a = ANALYSES.pop(b.id, None)
    if not a or a["user_id"] != u["id"]:
        raise HTTPException(400, "This analysis expired. Submit the report again.")
    now = datetime.now(timezone.utc); dup = find_dup(a["type"], a["lat"], a["lng"], now)
    name = db.execute("select name from users where id=?", (u["id"],)).fetchone()["name"]
    cur = db.execute("insert into reports(user_id,user_name,type,severity,confidence,lat,lng,description,image,dup_of,engine,created) values(?,?,?,?,?,?,?,?,?,?,?,?)",
                     (u["id"], name, a["type"], a["sev"], a["conf"], a["lat"], a["lng"], a["description"], a["image"], dup["id"] if dup else None, a["engine"], now.isoformat()))
    rid = cur.lastrowid
    db.execute("update reports set code=? where id=?", ("HZ-%d-%03d" % (now.year, rid), rid))
    if dup: db.execute("update reports set confirms=confirms+1 where id=?", (dup["id"],))
    db.commit()
    out = row(db.execute("select * from reports where id=?", (rid,)).fetchone())
    if dup: out["verified"] = True; out["confirms"] = dup["confirms"] + 1
    return out

@app.get("/api/me")
def me(u=Depends(current)):
    r = db.execute("select id,name,email,role from users where id=?", (u["id"],)).fetchone()
    d = dict(r); d["reports"] = db.execute("select count(*) c from reports where user_id=?", (u["id"],)).fetchone()["c"]
    return d

@app.put("/api/me")
def update_me(p: Profile, u=Depends(current)):
    if p.name.strip(): db.execute("update users set name=? where id=?", (p.name.strip(), u["id"]))
    if p.password:
        if len(p.password) < 6: raise HTTPException(400, "Password must be at least 6 characters.")
        db.execute("update users set pw=? where id=?", (hash_pw(p.password), u["id"]))
    db.commit(); return me(u)

@app.get("/api/admin/users")
def users(u=Depends(admin_only)):
    return [dict(r) for r in db.execute("select u.id,u.name,u.email,u.role,(select count(*) from reports where user_id=u.id) reports from users u order by u.id")]

@app.get("/api/reports/mine")
def mine(u=Depends(current)):
    return [row(r) for r in db.execute("select * from reports where user_id=? order by id desc", (u["id"],))]

@app.get("/api/reports/nearby")
def nearby(lat: float = None, lng: float = None, km_radius: float = 10, u=Depends(current)):
    out = []
    for r in db.execute("select * from reports where status!='Resolved' and dup_of is null order by id desc limit 200"):
        if lat is None or lng is None or km(lat, lng, r["lat"], r["lng"]) <= km_radius: out.append(row(r))
    return out[:40]

@app.get("/api/admin/reports")
def all_reports(u=Depends(admin_only)):
    return [row(r) for r in db.execute("select * from reports where dup_of is null order by id desc")]

@app.patch("/api/admin/reports/{rid}")
def set_status(rid: int, s: Status, u=Depends(admin_only)):
    if s.status not in ("Active", "In Progress", "Resolved"): raise HTTPException(400, "Unknown status.")
    db.execute("update reports set status=? where id=?", (s.status, rid)); db.commit()
    return {"ok": True}
