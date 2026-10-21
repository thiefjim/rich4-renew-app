// rich4 測試報名：邀請碼把關，iOS 走 ASC 團隊邀請 + TestFlight 內部群組，Android 只記錄讓擁有者手動加名單。
// 只做「內部測試」：素材僅供私人使用，不能走外部 TestFlight / Beta App Review / Play 封閉以上測試軌。

const APP_ID = "6825175562";
const BETA_GROUP_ID = "f4a32b2b-3695-480c-a690-3a966f3bfef4";
const PLAY_OPT_IN = "https://play.google.com/apps/internaltest/4701735668733691021";
const ASC = "https://api.appstoreconnect.apple.com/v1";
const RECORD_TTL = 30 * 24 * 3600; // 30 天後 KV 自動過期，cron 不用另外清

type Platform = "ios" | "android";
type SignupRecord = {
  p: Platform;
  email: string;
  first: string;
  last: string;
  status: "pending" | "done";
  created: number; // epoch 秒
  note?: string;
};

const enc = new TextEncoder();

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

// 先 SHA-256 再逐位元比較：長度不同也不會從時間洩漏。
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([a, b].map((s) => crypto.subtle.digest("SHA-256", enc.encode(s))));
  const u = new Uint8Array(x), v = new Uint8Array(y);
  let d = 0;
  for (let i = 0; i < u.length; i++) d |= u[i] ^ v[i];
  return d === 0 && b.length > 0;
}

export type Input = { email: string; first: string; last: string; p: Platform };

export function validate(f: FormData): Input | string {
  const email = String(f.get("email") ?? "").trim().toLowerCase();
  const first = String(f.get("first") ?? "").trim();
  const last = String(f.get("last") ?? "").trim();
  const p = f.get("platform");
  if (email.length > 254 || !/^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/.test(email)) return "Email 格式不正確";
  if (!first || first.length > 50 || !last || last.length > 50) return "名字與姓氏必填，各 50 字以內";
  if (p !== "ios" && p !== "android") return "請選擇 iPhone 或 Android";
  return { email, first, last, p };
}

// ---------- HTML ----------

const CSS = `body{font-family:-apple-system,"PingFang TC","Noto Sans TC",sans-serif;max-width:560px;margin:0 auto;padding:16px;line-height:1.6;color:#222}
h1{font-size:1.4em}label{display:block;margin:12px 0 4px;font-weight:600}
input[type=text],input[type=email]{width:100%;box-sizing:border-box;padding:10px;font-size:16px;border:1px solid #bbb;border-radius:8px}
.radio{display:flex;gap:24px;margin-top:4px}.radio label{font-weight:400;margin:0}
button{margin-top:20px;width:100%;padding:12px;font-size:17px;border:0;border-radius:8px;background:#c62828;color:#fff}
.steps{background:#f6f6f6;border-radius:8px;padding:8px 16px;margin-top:16px}
form:has(#p-ios:checked) .s-android,form:has(#p-android:checked) .s-ios{display:none}
table{border-collapse:collapse;width:100%;font-size:14px}td,th{border-bottom:1px solid #ddd;padding:6px 4px;text-align:left}
td form{display:inline}td button{margin:0;width:auto;padding:4px 8px;font-size:13px}.err{color:#c62828}`;

function page(title: string, body: string, status = 200): Response {
  return new Response(
    `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><style>${CSS}</style></head><body>${body}</body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );
}

const IOS_STEPS = `<div class="steps s-ios"><b>iPhone</b><ol>
<li>先從 App Store 安裝 <a href="https://apps.apple.com/app/testflight/id899247664">TestFlight</a>。</li>
<li>Email 必須是你 iPhone 登入的 Apple 帳號 email。</li>
<li>送出後會收到 Apple「加入 App Store Connect 團隊」的邀請信，必須用該 email 的 Apple 帳號接受。</li>
<li>接受後約 10–30 分鐘內會自動收到 TestFlight 邀請，從 TestFlight 安裝即可。</li></ol></div>`;

const ANDROID_STEPS = `<div class="steps s-android"><b>Android</b><ol>
<li>Email 必須是手機 Google Play 登入的 Google 帳號。</li>
<li>送出後等開發者把你加入測試名單，加好後會通知你。</li>
<li>之後開啟測試連結 <a href="${PLAY_OPT_IN}">${PLAY_OPT_IN}</a>，按「成為測試人員」，再從 Google Play 安裝。</li></ol></div>`;

function formPage(): Response {
  return page(
    "大富翁4 重制 測試報名",
    `<h1>大富翁4 重制 測試報名</h1><p>僅限受邀朋友。填好資料與邀請碼後送出。</p>
<form method="post" action="/signup">
<label for="code">邀請碼</label><input type="text" id="code" name="code" required autocomplete="off" autocapitalize="characters">
<label for="email">Email</label><input type="email" id="email" name="email" required maxlength="254">
<label for="first">名字</label><input type="text" id="first" name="first" required maxlength="50" autocomplete="given-name">
<label for="last">姓氏</label><input type="text" id="last" name="last" required maxlength="50" autocomplete="family-name">
<label>平台</label><div class="radio" role="radiogroup">
<label><input type="radio" id="p-ios" name="platform" value="ios" required> iPhone</label>
<label><input type="radio" id="p-android" name="platform" value="android"> Android</label></div>
${IOS_STEPS}${ANDROID_STEPS}
<button type="submit">送出報名</button></form>`,
  );
}

const msg = (title: string, html: string, status = 200) =>
  page(title, `<h1>${esc(title)}</h1>${html}<p><a href="/">回報名頁</a></p>`, status);

// ---------- App Store Connect ----------

const b64url = (b: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function ascToken(env: Env): Promise<string> {
  const der = Uint8Array.from(atob(env.ASC_PRIVATE_KEY.replace(/-----[^-]+-----|\s/g, "")), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(enc.encode(JSON.stringify({ alg: "ES256", kid: env.ASC_KEY_ID, typ: "JWT" })));
  const body = b64url(enc.encode(JSON.stringify({ iss: env.ASC_ISSUER_ID, iat: now, exp: now + 900, aud: "appstoreconnect-v1" })));
  // WebCrypto ECDSA 簽章本來就是 raw r||s，正好是 JWT ES256 要的格式。
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(sig)}`;
}

async function asc(token: string, path: string, init?: { method: string; body: unknown }) {
  const res = await fetch(ASC + path, {
    method: init?.method ?? "GET",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: init ? JSON.stringify(init.body) : undefined,
  });
  const json = res.status === 204 ? null : ((await res.json().catch(() => null)) as { data?: { id: string }[] } | null);
  if (!res.ok && res.status !== 409) throw new Error(`ASC ${init?.method ?? "GET"} ${path.split("?")[0]} ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  return { status: res.status, data: json?.data ?? [] };
}

const isMember = async (t: string, email: string) =>
  (await asc(t, `/users?filter[username]=${encodeURIComponent(email)}&limit=1`)).data.length > 0;

async function invite(t: string, r: SignupRecord): Promise<"invited" | "exists"> {
  const res = await asc(t, "/userInvitations", {
    method: "POST",
    body: {
      data: {
        type: "userInvitations",
        attributes: { email: r.email, firstName: r.first, lastName: r.last, roles: ["CUSTOMER_SUPPORT"], allAppsVisible: false, provisioningAllowed: false },
        relationships: { visibleApps: { data: [{ type: "apps", id: APP_ID }] } },
      },
    },
  });
  return res.status === 409 ? "exists" : "invited";
}

// 已是 betaTester 就只補群組關係（冪等）；否則建立並直接帶群組。
async function addToGroup(t: string, r: SignupRecord): Promise<void> {
  const found = await asc(t, `/betaTesters?filter[email]=${encodeURIComponent(r.email)}&limit=1`);
  if (found.data.length) {
    await asc(t, `/betaGroups/${BETA_GROUP_ID}/relationships/betaTesters`, {
      method: "POST",
      body: { data: [{ type: "betaTesters", id: found.data[0].id }] },
    });
    return;
  }
  await asc(t, "/betaTesters", {
    method: "POST",
    body: {
      data: {
        type: "betaTesters",
        attributes: { email: r.email, firstName: r.first, lastName: r.last },
        relationships: { betaGroups: { data: [{ type: "betaGroups", id: BETA_GROUP_ID }] } },
      },
    },
  });
}

// ---------- 儲存 ----------

const keyOf = (p: Platform, email: string) => `${p}:${email}`;

// 整筆資料也放 metadata（< 1KB），admin 列表一次 list 就拿到，不必逐筆 get。
const save = (env: Env, r: SignupRecord) =>
  env.KV.put(keyOf(r.p, r.email), JSON.stringify(r), { metadata: r, expiration: r.created + RECORD_TTL });

async function listAll(env: Env): Promise<{ name: string; r: SignupRecord }[]> {
  const out: { name: string; r: SignupRecord }[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.KV.list<SignupRecord>({ cursor });
    for (const k of page.keys) if (k.metadata) out.push({ name: k.name, r: k.metadata });
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return out.sort((a, b) => b.r.created - a.r.created);
}

// ---------- 通知 ----------

const b64 = (s: string) => btoa(String.fromCharCode(...enc.encode(s)));

async function notifyOwner(env: Env, r: SignupRecord): Promise<void> {
  if (!env.MAIL) return;
  // 動態 import：讓 node 測試能載入本檔（cloudflare:* 只存在於 Workers runtime）。
  const { EmailMessage } = await import("cloudflare:email");
  const from = "rich4-signup@tappedia.com";
  const to = "jj@jjlindev.com"; // 須與 wrangler.jsonc send_email destination_address 一致
  const text = `Android 測試報名\n\nEmail: ${r.email}\n姓名: ${r.last} ${r.first}\n\n請把 email 貼到 Play Console 內部測試 email 名單「Dev」，再到 /admin 標記完成並通知對方。`;
  const raw = [
    `From: rich4 signup <${from}>`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${b64(`rich4 Android 報名：${r.email}`)}?=`,
    `Message-ID: <${crypto.randomUUID()}@tappedia.com>`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    b64(text).replace(/.{76}/g, "$&\r\n"),
  ].join("\r\n");
  await env.MAIL.send(new EmailMessage(from, to, raw));
}

// ---------- handlers ----------

async function signup(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (Number(req.headers.get("content-length") ?? 0) > 8192) return msg("資料太大", "", 413);
  const f = await req.formData();
  const code = String(f.get("code") ?? "").trim().toUpperCase();
  if (!(await safeEqual(code, env.INVITE_CODE))) {
    return msg("邀請碼不正確", `<p class="err">請確認邀請碼後再試一次。邀請碼請向邀請你的朋友索取。</p>`, 403);
  }
  const v = validate(f);
  if (typeof v === "string") return msg("資料有誤", `<p class="err">${esc(v)}</p>`, 400);

  const key = keyOf(v.p, v.email);
  const prev = await env.KV.get<SignupRecord>(key, "json");
  if (prev) {
    return msg("已經報名過了", `<p>${esc(v.email)} 已在名單中（狀態：${prev.status === "done" ? "已完成" : "處理中"}）。${v.p === "ios" ? IOS_STEPS : ANDROID_STEPS}</p>`);
  }
  const r: SignupRecord = { ...v, status: "pending", created: Math.floor(Date.now() / 1000) };

  if (v.p === "android") {
    await save(env, r);
    ctx.waitUntil(notifyOwner(env, r).catch((e) => console.error(JSON.stringify({ msg: "notify failed", err: String(e) }))));
    return msg("報名成功（Android）", `<p>已收到 ${esc(v.email)}（${esc(v.last)} ${esc(v.first)}）。</p>${ANDROID_STEPS}`);
  }

  let note: string;
  try {
    const t = await ascToken(env);
    note = (await isMember(t, v.email)) ? "already member" : await invite(t, r);
  } catch (e) {
    console.error(JSON.stringify({ msg: "invite failed", email: v.email, err: String(e) }));
    return msg("暫時無法處理", `<p class="err">Apple 端暫時出錯，請稍後再試，或直接聯絡開發者。</p>`, 502);
  }
  await save(env, { ...r, note });
  const lead =
    note === "invited"
      ? `<p>已寄出 Apple「加入 App Store Connect 團隊」邀請信到 ${esc(v.email)}，請用該 Apple 帳號接受。</p>`
      : `<p>${esc(v.email)} 已是團隊成員或已有待接受的邀請；接受後約 10–30 分鐘內會收到 TestFlight 邀請。</p>`;
  return msg("報名成功（iPhone）", lead + IOS_STEPS);
}

// 回傳處理結果供 admin「立即同步」顯示。
export async function syncIos(env: Env): Promise<string[]> {
  const pending = (await listAll(env)).filter((x) => x.r.p === "ios" && x.r.status === "pending");
  if (!pending.length) return [];
  const t = await ascToken(env);
  const log: string[] = [];
  for (const { r } of pending) {
    try {
      if (!(await isMember(t, r.email))) {
        log.push(`${r.email}: 尚未接受團隊邀請`);
        continue;
      }
      await addToGroup(t, r);
      await save(env, { ...r, status: "done" });
      log.push(`${r.email}: 已加入 TestFlight 內部群組`);
    } catch (e) {
      log.push(`${r.email}: 錯誤 ${String(e)}`);
    }
  }
  console.log(JSON.stringify({ msg: "sync", log }));
  return log;
}

async function admin(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const f = req.method === "POST" ? await req.formData() : null;
  const token = String((f ? f.get("token") : url.searchParams.get("token")) ?? "");
  if (!(await safeEqual(token, env.ADMIN_TOKEN))) return msg("沒有權限", "", 403);

  let notice = "";
  if (f) {
    const action = f.get("action");
    const key = String(f.get("key") ?? "");
    if (action === "sync") {
      notice = (await syncIos(env)).map(esc).join("<br>") || "沒有待處理的 iOS 報名";
    } else if (action === "delete" && key) {
      await env.KV.delete(key);
      notice = `已刪除 ${esc(key)}`;
    } else if (action === "done" && key) {
      const r = await env.KV.get<SignupRecord>(key, "json");
      if (r) await save(env, { ...r, status: "done" });
      notice = `已標記完成 ${esc(key)}`;
    }
  }

  const tok = esc(token);
  const btn = (action: string, label: string, key = "") =>
    `<form method="post" action="/admin"><input type="hidden" name="token" value="${tok}"><input type="hidden" name="action" value="${action}"><input type="hidden" name="key" value="${esc(key)}"><button type="submit">${label}</button></form>`;
  const rows = await listAll(env);
  const androidPending = rows.filter((x) => x.r.p === "android" && x.r.status === "pending").map((x) => esc(x.r.email));
  const tr = rows
    .map(({ name, r }) =>
      `<tr><td>${r.p === "ios" ? "iPhone" : "Android"}</td><td>${esc(r.email)}</td><td>${esc(r.last)} ${esc(r.first)}</td><td>${r.status === "done" ? "完成" : "待處理"}${r.note ? `<br><small>${esc(r.note)}</small>` : ""}</td><td>${new Date(r.created * 1000).toISOString().slice(0, 16).replace("T", " ")}</td><td>${r.p === "android" ? (r.status === "pending" ? btn("done", "完成", name) : "") + btn("delete", "刪除", name) : ""}</td></tr>`)
    .join("");
  return page(
    "rich4 報名管理",
    `<h1>rich4 報名管理</h1>${notice ? `<p>${notice}</p>` : ""}
<p>${btn("sync", "立即同步 iOS（同 cron）")}</p>
<h2>待加入 Play「Dev」名單的 Android email</h2><textarea readonly rows="3" style="width:100%">${androidPending.join(", ")}</textarea>
<table><tr><th>平台</th><th>Email</th><th>姓名</th><th>狀態</th><th>建立 (UTC)</th><th></th></tr>${tr}</table>
<p><small>KV 列表最終一致，剛寫入的資料可能晚約一分鐘才出現。紀錄 30 天後自動刪除。</small></p>`,
  );
}

export default {
  async fetch(req, env, ctx): Promise<Response> {
    const { pathname } = new URL(req.url);
    try {
      if (pathname === "/" && req.method === "GET") return formPage();
      if (pathname === "/signup" && req.method === "POST") return await signup(req, env, ctx);
      if (pathname === "/admin" && (req.method === "GET" || req.method === "POST")) return await admin(req, env);
      return new Response("Not found", { status: 404 });
    } catch (e) {
      console.error(JSON.stringify({ msg: "unhandled", path: pathname, err: String(e) }));
      return msg("發生錯誤", `<p class="err">請稍後再試。</p>`, 500);
    }
  },
  async scheduled(_ev, env, ctx) {
    ctx.waitUntil(syncIos(env));
  },
} satisfies ExportedHandler<Env>;
