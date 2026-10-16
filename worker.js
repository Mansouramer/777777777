const page = (msg, status = 401) => new Response(
  <meta charset="utf-8"><meta name="viewport" content="width=device-width">
  <body style="font-family:sans-serif;text-align:center;margin-top:20vh" dir="rtl">
  <form method="POST"><h3>أدخل الرقم السري</h3>
  <input name="pw" type="password" autofocus style="padding:10px;font-size:18px">
  <button style="padding:10px 20px;font-size:18px">دخول</button>
  <p style="color:red">${msg}</p></form></body>,
  { status, headers: { "Content-Type": "text/html;charset=utf-8" } }
);

export default {
  async fetch(request, env) {
    const cfg = JSON.parse((await env.KV.get("config")) || "null");
    if (!cfg) return page("الإعدادات غير موجودة", 500);
    if (!cfg.active) return page("الاشتراك متوقف");
    if (new Date() > new Date(cfg.expires + "T23:59:59Z")) return page("انتهى الاشتراك");

    const devices = JSON.parse((await env.KV.get("devices")) || "[]");
    const m = (request.headers.get("Cookie") || "").match(/dev=([^;]+)/);
    const token = m && m[1];

    if (token && devices.includes(token)) {
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

    if (request.method === "POST") {
      const form = await request.formData();
      if (form.get("pw") !== env.PASSWORD) return page("رقم خاطئ");
      if (devices.length >= cfg.maxDevices)
        return page("وصلت للحد الأقصى من الأجهزة (" + cfg.maxDevices + ")");
      const t = crypto.randomUUID();
      devices.push(t);
      await env.KV.put("devices", JSON.stringify(devices));
      return new Response(null, { status: 303, headers: {
        Location: "/",
        "Set-Cookie": dev=${t}; Max-Age=31536000; Path=/; HttpOnly; Secure; SameSite=Strict
      }});
    }
    return page("");
  }
};
