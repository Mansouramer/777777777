const page = (msg, status = 401) => {
  const html = '<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1"></head>'
    + '<body style="font-family:sans-serif;text-align:center;margin-top:15vh">'
    + '<form method="POST"><h3>تسجيل الدخول</h3>'
    + '<input name="user" placeholder="رمز الدخول" style="padding:10px;font-size:18px;margin:5px"><br>'
    + '<button type="submit" style="padding:10px 20px;font-size:18px">دخول</button>'
    + '<p style="color:red">' + msg + '</p></form></body></html>';
  return new Response(html, { status, headers: { "Content-Type": "text/html;charset=utf-8" } });
};

const getCookie = (req, name) => {
  const m = (req.headers.get("Cookie") || "").match(new RegExp(name + "=([^;]+)"));
  return m ? decodeURIComponent(m[1]) : null;
};

const isValid = (cfg) =>
  cfg && cfg.active && new Date() <= new Date(cfg.expires + "T23:59:59Z");

export default {
  async fetch(request, env) {
    const user = getCookie(request, "acct");
    const token = getCookie(request, "dev");

    if (user && token && !user.startsWith("devices:")) {
      const cfg = JSON.parse((await env.KV.get(user)) || "null");
      const devices = JSON.parse((await env.KV.get("devices:" + user)) || "[]");
      if (isValid(cfg) && devices.includes(token)) {
        const path = new URL(request.url).pathname;
        if (path === "/api/config") return Response.json(cfg);
        if (path === "/api/drive") {
          let r;
          if (request.method === "POST") {
            const body = JSON.parse(await request.text());
            body.auth = env.DRIVE_KEY;
            r = await fetch(env.DRIVE_URL, { method: "POST", body: JSON.stringify(body) });
          } else {
            r = await fetch(env.DRIVE_URL + "?auth=" + env.DRIVE_KEY);
          }
          return new Response(r.body, { headers: { "Content-Type": "application/json" } });
        }
        return env.ASSETS.fetch(request);
      }
    }

    if (request.method === "POST") {
      const form = await request.formData();
      const u = String(form.get("user") || "").trim();
      if (!u || u.startsWith("devices:")) return page("رمز خاطئ");

      const cfg = JSON.parse((await env.KV.get(u)) || "null");
      if (!cfg) return page("رمز خاطئ");
      if (!cfg.active) return page("الاشتراك متوقف");
      if (!isValid(cfg)) return page("انتهى الاشتراك");

      const key = "devices:" + u;
      const devices = JSON.parse((await env.KV.get(key)) || "[]");
      let t = getCookie(request, "dev");
      if (!t || !devices.includes(t)) {
        if (devices.length >= cfg.maxDevices) {
          return page("وصلت للحد الأقصى من الأجهزة (" + cfg.maxDevices + ")");
        }
        t = crypto.randomUUID();
        devices.push(t);
        await env.KV.put(key, JSON.stringify(devices));
      }

      const h = new Headers({ "Location": "/" });
      const attrs = "; Max-Age=31536000; Path=/; HttpOnly; Secure; SameSite=Strict";
      h.append("Set-Cookie", "dev=" + t + attrs);
      h.append("Set-Cookie", "acct=" + encodeURIComponent(u) + attrs);
      return new Response(h.get("Location") ? null : null, { status: 303, headers: h });
    }

    return page("");
  }
};
