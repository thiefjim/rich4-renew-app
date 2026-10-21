// node test/signup.test.mjs — 不碰網路：只測邀請碼把關、輸入驗證與跳脫。
import assert from "node:assert/strict";
import worker, { esc, safeEqual } from "../src/index.ts";

const puts = [];
const store = new Map();
const env = {
  INVITE_CODE: "ABCD2345",
  ADMIN_TOKEN: "x".repeat(32),
  KV: {
    get: async (k) => (store.has(k) ? JSON.parse(store.get(k)) : null),
    put: async (k, v) => (puts.push(k), store.set(k, v)),
    list: async () => ({ keys: [], list_complete: true }),
    delete: async (k) => store.delete(k),
  },
};
const waits = [];
const ctx = { waitUntil: (p) => waits.push(p) };
const post = (fields) =>
  worker.fetch(new Request("https://t/signup", { method: "POST", body: new URLSearchParams(fields) }), env, ctx);
const base = { email: "a@b.co", first: "小明", last: "王", platform: "android" };

// 錯的邀請碼：403，且完全沒有寫入
let res = await post({ ...base, code: "WRONG000" });
assert.equal(res.status, 403);
assert.equal(puts.length, 0);
res = await post({ ...base, code: "" });
assert.equal(res.status, 403);
assert.equal(puts.length, 0);

// 驗證
assert.equal((await post({ ...base, code: "abcd2345", email: "nope" })).status, 400);
assert.equal((await post({ ...base, code: "ABCD2345", first: "" })).status, 400);
assert.equal((await post({ ...base, code: "ABCD2345", last: "x".repeat(51) })).status, 400);
assert.equal((await post({ ...base, code: "ABCD2345", platform: "pc" })).status, 400);
assert.equal(puts.length, 0);

// 正確邀請碼（大小寫不拘）+ Android：存一筆，輸出已跳脫
res = await post({ ...base, code: " abcd2345 ", first: "<script>x</script>" });
assert.equal(res.status, 200);
const html = await res.text();
assert.ok(!html.includes("<script>x"));
assert.ok(html.includes("&#60;script&#62;x"));
assert.deepEqual(puts, ["android:a@b.co"]);
await Promise.all(waits); // 沒有 MAIL binding 時通知直接略過

assert.equal(esc(`<a href="x">'&`), "&#60;a href=&#34;x&#34;&#62;&#39;&#38;");
assert.equal(await safeEqual("abc", "abc"), true);
assert.equal(await safeEqual("abc", "abd"), false);
assert.equal(await safeEqual("", ""), false); // 未設定 secret 時不放行

// admin 錯 token
res = await worker.fetch(new Request("https://t/admin?token=bad"), env, ctx);
assert.equal(res.status, 403);

console.log("ok: signup tests passed");
