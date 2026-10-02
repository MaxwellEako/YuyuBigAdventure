/**
 * 心阵棋局 · 试玩记录服务
 *
 * 玩家每进入一个章节，游戏把「名字 + 章节 + 当时的整份存档」发到这里记一条，
 * 用来大致了解试玩玩家玩到了哪里。服务只收不发：游戏从不从这里读存档，玩家本机的存档不受影响。
 *
 * 名字就是玩家的唯一标识（只是测试用，同名的玩家会记到一起）。
 *
 * 运行：node save-service.mjs（Node 24，零依赖，用内置的 node:sqlite）
 * 环境变量：
 *   PORT          监听端口，默认 8443
 *   HOST          监听地址，默认 0.0.0.0
 *   DB_PATH       SQLite 文件，默认 ./saves.db
 *   ADMIN_KEY     查看页的口令（必填，至少 16 位）
 *   TLS_CERT      证书链文件（fullchain）；和 TLS_KEY 都给出时用 HTTPS，否则用 HTTP（只用于本机测试）
 *   TLS_KEY       私钥文件
 *   ALLOW_ORIGINS 允许调用的网页来源，逗号分隔
 *
 * 接口：
 *   POST /v1/record          记一条进入章节的记录
 *   GET  /health             健康检查
 *   GET  /admin?key=口令      查看页
 *   GET  /admin/data.json?key=口令
 */
import { createServer as createHttps } from "node:https";
import { createServer as createHttp } from "node:http";
import { readFileSync } from "node:fs";
import { timingSafeEqual, createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

const PORT = Number(process.env.PORT ?? 8443);
const HOST = process.env.HOST ?? "0.0.0.0";
const DB_PATH = process.env.DB_PATH ?? "./saves.db";
const ADMIN_KEY = process.env.ADMIN_KEY ?? "";
const TLS_CERT = process.env.TLS_CERT;
const TLS_KEY = process.env.TLS_KEY;
const ALLOW_ORIGINS = new Set(
  (process.env.ALLOW_ORIGINS ?? "https://xrephmos.github.io,http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

const MAX_BODY = 32 * 1024;
const MAX_NAME = 32;
const RATE_LIMIT = 30; // 每个 IP 每分钟最多记多少条

if (ADMIN_KEY.length < 16) {
  console.error("ADMIN_KEY 未设置或太短（至少 16 位）");
  process.exit(1);
}

// ——— 数据库 ———

const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 3000;
  CREATE TABLE IF NOT EXISTS players (
    name        TEXT PRIMARY KEY,
    level_key   TEXT,
    level_index INTEGER,
    unlocked    INTEGER,
    stars       INTEGER,
    progress    TEXT,
    records     INTEGER NOT NULL DEFAULT 0,
    first_seen  TEXT NOT NULL,
    last_seen   TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS records (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    level_key   TEXT,
    level_index INTEGER,
    unlocked    INTEGER,
    stars       INTEGER,
    progress    TEXT,
    created_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS records_name ON records(name, id);
`);

const insertRecord = db.prepare(
  `INSERT INTO records (name, level_key, level_index, unlocked, stars, progress, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?)`,
);
const upsertPlayer = db.prepare(
  `INSERT INTO players (name, level_key, level_index, unlocked, stars, progress, records, first_seen, last_seen)
   VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
   ON CONFLICT(name) DO UPDATE SET
     level_key = excluded.level_key, level_index = excluded.level_index,
     unlocked = excluded.unlocked, stars = excluded.stars, progress = excluded.progress,
     records = players.records + 1, last_seen = excluded.last_seen`,
);
const listPlayers = db.prepare(
  `SELECT name, level_key, level_index, unlocked, stars, records, first_seen, last_seen
   FROM players ORDER BY last_seen DESC LIMIT 500`,
);
const listRecords = db.prepare(
  `SELECT id, name, level_key, level_index, unlocked, stars, created_at
   FROM records ORDER BY id DESC LIMIT 300`,
);

// ——— 工具 ———

const now = () => new Date().toISOString();

function sameSecret(a, b) {
  const ha = createHash("sha256").update(String(a)).digest();
  const hb = createHash("sha256").update(String(b)).digest();
  return timingSafeEqual(ha, hb);
}

const hits = new Map();
function rateLimited(ip) {
  const minute = Math.floor(Date.now() / 60000);
  const entry = hits.get(ip);
  if (!entry || entry.minute !== minute) {
    hits.set(ip, { minute, count: 1 });
    if (hits.size > 10000) hits.clear();
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT;
}

function corsHeaders(req) {
  const origin = req.headers.origin;
  if (!origin || !ALLOW_ORIGINS.has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function send(res, status, body, headers = {}) {
  const isText = typeof body === "string";
  res.writeHead(status, {
    "Content-Type": isText ? "text/html; charset=utf-8" : "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...headers,
  });
  res.end(isText ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    // 超长的请求体只读不存，读完再回 413；请求超时会兜住一直不停发数据的情况。
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size <= MAX_BODY) chunks.push(chunk);
    });
    req.on("end", () => (size > MAX_BODY ? reject(new Error("too large")) : resolve(Buffer.concat(chunks).toString("utf8"))));
    req.on("error", reject);
  });
}

const escapeHtml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

const starsOf = (progress) =>
  Object.values(progress?.stars ?? {}).reduce((sum, n) => sum + (Number.isFinite(n) ? n : 0), 0);

/** 校验上报内容；不合格返回 null。 */
function parseRecord(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const name = typeof data.name === "string" ? data.name.trim() : "";
  if (!name || [...name].length > MAX_NAME) return null;
  const levelKey = typeof data.levelKey === "string" ? data.levelKey.slice(0, 40) : null;
  const levelIndex = Number.isInteger(data.levelIndex) ? data.levelIndex : null;
  const progress = data.progress && typeof data.progress === "object" ? data.progress : null;
  const unlocked = Number.isInteger(progress?.unlocked) ? progress.unlocked : null;
  return { name, levelKey, levelIndex, unlocked, stars: starsOf(progress), progress: progress ? JSON.stringify(progress) : null };
}

// ——— 查看页 ———

function adminPage() {
  const players = listPlayers.all();
  const records = listRecords.all();
  const time = (iso) => escapeHtml(new Date(iso).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }));
  const playerRows = players
    .map(
      (p) =>
        `<tr><td>${escapeHtml(p.name)}</td><td>${p.level_index ?? ""} · ${escapeHtml(p.level_key)}</td><td>${p.unlocked ?? ""}</td><td>${p.stars ?? 0}</td><td>${p.records}</td><td>${time(p.first_seen)}</td><td>${time(p.last_seen)}</td></tr>`,
    )
    .join("");
  const recordRows = records
    .map(
      (r) =>
        `<tr><td>${time(r.created_at)}</td><td>${escapeHtml(r.name)}</td><td>${r.level_index ?? ""} · ${escapeHtml(r.level_key)}</td><td>${r.unlocked ?? ""}</td><td>${r.stars ?? 0}</td></tr>`,
    )
    .join("");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>试玩记录</title>
<style>
  :root { --ink:#111; --accent:#002fa7; --line:#ddd; --bg:#fafaf7; }
  body { margin:0; padding:24px 16px; font:14px/1.5 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif; color:var(--ink); background:var(--bg); }
  h1 { margin:0 0 4px; font-weight:300; font-size:28px; }
  h2 { margin:32px 0 8px; font-size:16px; border-top:4px solid var(--accent); padding-top:8px; }
  p { margin:0; color:#666; }
  .wrap { overflow-x:auto; }
  table { border-collapse:collapse; width:100%; min-width:560px; background:#fff; }
  th, td { text-align:left; padding:6px 10px; border-bottom:1px solid var(--line); white-space:nowrap; }
  th { font-size:12px; color:#666; font-weight:600; }
  td:first-child { font-weight:600; }
</style></head><body>
<h1>心阵棋局 · 试玩记录</h1>
<p>${players.length} 名玩家 · 最近 ${records.length} 条进入章节记录 · 章节序号 0 为序章</p>
<h2>玩家</h2><div class="wrap"><table><thead><tr><th>名字</th><th>最近进入的章节</th><th>已解锁</th><th>星数</th><th>记录数</th><th>首次</th><th>最近</th></tr></thead><tbody>${playerRows}</tbody></table></div>
<h2>进入章节记录</h2><div class="wrap"><table><thead><tr><th>时间</th><th>名字</th><th>章节</th><th>已解锁</th><th>星数</th></tr></thead><tbody>${recordRows}</tbody></table></div>
</body></html>`;
}

// ——— 路由 ———

async function handle(req, res) {
  const url = new URL(req.url, "http://local");
  const cors = corsHeaders(req);
  const ip = req.socket.remoteAddress ?? "";

  if (req.method === "OPTIONS") return send(res, 204, "", cors);

  if (req.method === "GET" && url.pathname === "/health") return send(res, 200, { ok: true }, cors);

  if (req.method === "POST" && url.pathname === "/v1/record") {
    if (rateLimited(ip)) return send(res, 429, { error: "too many requests" }, cors);
    let text;
    try {
      text = await readBody(req);
    } catch {
      return send(res, 413, { error: "body too large" }, cors);
    }
    const rec = parseRecord(text);
    if (!rec) return send(res, 400, { error: "invalid record" }, cors);
    const at = now();
    db.exec("BEGIN");
    try {
      insertRecord.run(rec.name, rec.levelKey, rec.levelIndex, rec.unlocked, rec.stars, rec.progress, at);
      upsertPlayer.run(rec.name, rec.levelKey, rec.levelIndex, rec.unlocked, rec.stars, rec.progress, at, at);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      console.error(error);
      return send(res, 500, { error: "server error" }, cors);
    }
    return send(res, 200, { ok: true }, cors);
  }

  if (req.method === "GET" && (url.pathname === "/admin" || url.pathname === "/admin/data.json")) {
    if (!sameSecret(url.searchParams.get("key") ?? "", ADMIN_KEY)) return send(res, 403, { error: "forbidden" });
    if (url.pathname === "/admin") return send(res, 200, adminPage());
    return send(res, 200, { players: listPlayers.all(), records: listRecords.all() });
  }

  return send(res, 404, { error: "not found" }, cors);
}

function onRequest(req, res) {
  handle(req, res).catch((error) => {
    console.error(error);
    if (!res.headersSent) send(res, 500, { error: "server error" });
  });
}

// ——— 启动 ———

let server;
if (TLS_CERT && TLS_KEY) {
  const tls = () => ({ cert: readFileSync(TLS_CERT), key: readFileSync(TLS_KEY) });
  server = createHttps(tls(), onRequest);
  // 证书每隔几天自动续期：定时重新读取，不用重启服务。
  setInterval(() => {
    try {
      server.setSecureContext(tls());
    } catch (error) {
      console.error("重新加载证书失败", error);
    }
  }, 6 * 3600 * 1000).unref();
} else {
  server = createHttp(onRequest);
}
server.requestTimeout = 10000;
server.headersTimeout = 10000;
server.listen(PORT, HOST, () => console.log(`save-service listening on ${TLS_CERT ? "https" : "http"}://${HOST}:${PORT}`));

for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    server.close();
    db.close();
    process.exit(0);
  });
