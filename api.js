const BASE = import.meta.env.VITE_API || "/api";
export async function api(path, { method = "GET", body, form, token } = {}) {
  const headers = {};
  if (token) headers.Authorization = "Bearer " + token;
  let data = form;                       // FormData: never set Content-Type yourself
  if (body) { headers["Content-Type"] = "application/json"; data = JSON.stringify(body); }
  let res;
  try { res = await fetch(BASE + path, { method, headers, body: data }); }
  catch { throw new Error("Cannot reach the server. Start the backend on port 8000 and try again."); }
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof j.detail === "string" ? j.detail : "Request failed (" + res.status + ")");
  return j;
}
