#!/usr/bin/env node
/**
 * GAS (Google Apps Script) → union-board (Supabase) 移行スクリプト
 *
 * 使い方:
 *   node scripts/migrate-from-gas/migrate.mjs --space-id <UUID> --input-dir ./data
 *
 * 入力ファイル（--input-dir 内に配置）:
 *   events.csv    - GAS Spreadsheet の Events シートをエクスポートしたもの
 *   members.csv   - GAS Spreadsheet の Members シートをエクスポートしたもの
 *   responses.csv - GAS Spreadsheet の Responses シートをエクスポートしたもの
 *   config.csv    - GAS Spreadsheet の Config シートをエクスポートしたもの
 *
 * 出力:
 *   stdout に SQL を出力（Supabase SQL エディタや psql に貼り付ける）
 *   stderr にログを出力
 */

import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { randomUUID } from 'crypto';

// ─── CLI 引数パース ─────────────────────────────────────────────

const args = process.argv.slice(2);
let spaceId = '';
let inputDir = './data';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--space-id' && args[i + 1]) spaceId = args[++i];
  if (args[i] === '--input-dir' && args[i + 1]) inputDir = args[++i];
  if (args[i] === '--help') {
    process.stdout.write(`
使い方:
  node scripts/migrate-from-gas/migrate.mjs --space-id <UUID> --input-dir <dir>

オプション:
  --space-id    Supabase の space UUID（必須）
  --input-dir   CSV ファイルが入っているディレクトリ（省略時: ./data）
  --help        このヘルプを表示
`);
    process.exit(0);
  }
}

if (!spaceId) {
  process.stderr.write('エラー: --space-id が指定されていません\n');
  process.stderr.write('例: node scripts/migrate-from-gas/migrate.mjs --space-id xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx --input-dir ./data\n');
  process.exit(1);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!UUID_RE.test(spaceId)) {
  process.stderr.write('エラー: --space-id が UUID 形式ではありません\n');
  process.exit(1);
}

const dir = resolve(inputDir);
log(`入力ディレクトリ: ${dir}`);
log(`space_id: ${spaceId}`);

// ─── ユーティリティ ─────────────────────────────────────────────

function log(msg) {
  process.stderr.write(`[migrate] ${msg}\n`);
}

function warn(msg) {
  process.stderr.write(`[warn]    ${msg}\n`);
}

function isUuid(s) {
  return UUID_RE.test(String(s));
}

/** NULL または空文字を SQL NULL に、それ以外は単引用符エスケープした文字列に変換 */
function sqlStr(v) {
  if (v === null || v === undefined || v === '') return 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}

// ─── CSV パーサー ───────────────────────────────────────────────

/** RFC 4180 準拠の CSV パーサー（クォート・改行・カンマ含む値に対応） */
function parseCsv(content) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < content.length) {
    const ch = content[i];
    if (inQuotes) {
      if (ch === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        field += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ',') {
        row.push(field);
        field = '';
        i++;
      } else if (ch === '\r' && content[i + 1] === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
        i += 2;
      } else if (ch === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
        i++;
      } else {
        field += ch;
        i++;
      }
    }
  }
  if (row.length > 0 || field !== '') {
    row.push(field);
    rows.push(row);
  }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

function csvToObjects(content, filename) {
  const rows = parseCsv(content);
  if (rows.length === 0) {
    warn(`${filename}: データが空です`);
    return [];
  }
  const headers = rows[0].map(h => h.trim());
  log(`${filename}: ヘッダー = [${headers.join(', ')}]`);
  log(`${filename}: データ行数 = ${rows.length - 1}`);
  return rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, j) => { obj[h] = (row[j] ?? '').trim(); });
    return obj;
  });
}

function loadCsv(filename) {
  const filepath = join(dir, filename);
  if (!existsSync(filepath)) {
    warn(`${filename} が見つかりません（スキップ）: ${filepath}`);
    return [];
  }
  return csvToObjects(readFileSync(filepath, 'utf-8'), filename);
}

// ─── ステータス変換 ─────────────────────────────────────────────

const STATUS_MAP = {
  '○': 'attend',
  '△': 'maybe',
  '×': 'absent',
  '-':  'unselected',
  'attend':     'attend',
  'maybe':      'maybe',
  'absent':     'absent',
  'unselected': 'unselected',
};

function convertStatus(s) {
  const mapped = STATUS_MAP[s];
  if (!mapped) {
    warn(`未知のステータス値: "${s}" → unselected として処理`);
    return 'unselected';
  }
  return mapped;
}

/** 空文字は null に変換、それ以外はそのまま */
function normalizeTs(s) {
  const t = (s ?? '').trim();
  return t === '' ? null : t;
}

// ─── CSV 読み込み ───────────────────────────────────────────────

const eventsRows    = loadCsv('events.csv');
const membersRows   = loadCsv('members.csv');
const responsesRows = loadCsv('responses.csv');
const configRows    = loadCsv('config.csv');

// ─── 1. Members 変換 ────────────────────────────────────────────

log('メンバー変換中...');

/** 旧 userKey → 新 userKey のマッピング */
const userKeyMap = new Map();

const membersInserts = membersRows.map((row, idx) => {
  const oldKey = row['userKey'] || '';
  let newKey;
  if (isUuid(oldKey)) {
    newKey = oldKey.toLowerCase();
  } else {
    newKey = randomUUID();
    warn(`userKey "${oldKey}" は UUID 形式ではないため新規採番: ${newKey}`);
  }
  userKeyMap.set(oldKey, newKey);

  const id          = randomUUID();
  const part        = row['part'] || '';
  const name        = row['name'] || '';
  const displayName = row['displayName'] || '';
  const createdAt   = normalizeTs(row['createdAt']);
  const updatedAt   = normalizeTs(row['updatedAt']);

  return [
    `-- member[${idx + 1}]: ${displayName}`,
    `INSERT INTO members (id, space_id, user_key, part, name, display_name, created_at, updated_at)`,
    `VALUES (`,
    `  ${sqlStr(id)}, ${sqlStr(spaceId)}, ${sqlStr(newKey)},`,
    `  ${sqlStr(part)}, ${sqlStr(name)}, ${sqlStr(displayName)},`,
    `  ${createdAt ? sqlStr(createdAt) : 'now()'}, ${updatedAt ? sqlStr(updatedAt) : 'now()'}`,
    `) ON CONFLICT (space_id, user_key) DO NOTHING;`,
  ].join('\n');
});

log(`メンバー: ${membersInserts.length} 件`);

// ─── 2. Events 変換 ─────────────────────────────────────────────

log('イベント変換中...');

const eventsInserts = eventsRows.map((row, idx) => {
  const id          = isUuid(row['id']) ? row['id'].toLowerCase() : randomUUID();
  const title       = row['title'] || '（タイトルなし）';
  const startAt     = normalizeTs(row['start']);
  const endAt       = normalizeTs(row['end']);
  const isAllDay    = row['isAllDay'] === 'true' ? 'true' : 'false';
  const location    = row['location'] || null;
  const description = row['description'] || null;
  const calEventId  = row['calendarEventId'] || null;
  const status      = ['active', 'archived', 'deleted'].includes(row['status'])
                        ? row['status'] : 'active';
  const createdAt   = normalizeTs(row['createdAt']);
  const updatedAt   = normalizeTs(row['updatedAt']);

  if (!startAt || !endAt) {
    warn(`event[${idx + 1}] "${title}": start または end が空 → now() で補完`);
  }

  return [
    `-- event[${idx + 1}]: ${title}`,
    `INSERT INTO events`,
    `  (id, space_id, title, start_at, end_at, is_all_day, location, description, calendar_event_id, status, created_at, updated_at)`,
    `VALUES (`,
    `  ${sqlStr(id)}, ${sqlStr(spaceId)}, ${sqlStr(title)},`,
    `  ${startAt ? sqlStr(startAt) : 'now()'}, ${endAt ? sqlStr(endAt) : 'now()'}, ${isAllDay},`,
    `  ${sqlStr(location)}, ${sqlStr(description)}, ${sqlStr(calEventId)}, ${sqlStr(status)},`,
    `  ${createdAt ? sqlStr(createdAt) : 'now()'}, ${updatedAt ? sqlStr(updatedAt) : 'now()'}`,
    `) ON CONFLICT (id) DO NOTHING;`,
  ].join('\n');
});

log(`イベント: ${eventsInserts.length} 件`);

// ─── 3. Responses 変換 ──────────────────────────────────────────

log('出欠回答変換中...');

let skippedResponses = 0;
const responsesInserts = [];

for (const [idx, row] of responsesRows.entries()) {
  const eventId = (row['eventId'] || '').trim();
  const oldKey  = (row['userKey'] || '').trim();
  const newKey  = userKeyMap.get(oldKey);

  if (!newKey) {
    warn(`response[${idx + 1}]: userKey "${oldKey}" に対応するメンバーなし（スキップ）`);
    skippedResponses++;
    continue;
  }
  if (!isUuid(eventId)) {
    warn(`response[${idx + 1}]: eventId "${eventId}" が UUID 形式ではありません（スキップ）`);
    skippedResponses++;
    continue;
  }

  const id        = randomUUID();
  const status    = convertStatus(row['status'] || '-');
  const comment   = row['comment'] || null;
  const createdAt = normalizeTs(row['createdAt']);
  const updatedAt = normalizeTs(row['updatedAt']);

  responsesInserts.push([
    `-- response[${idx + 1}]: event=${eventId} user=${newKey} status=${status}`,
    `INSERT INTO responses`,
    `  (id, space_id, event_id, user_key, status, comment, created_at, updated_at)`,
    `VALUES (`,
    `  ${sqlStr(id)}, ${sqlStr(spaceId)}, ${sqlStr(eventId)}, ${sqlStr(newKey)},`,
    `  ${sqlStr(status)}, ${sqlStr(comment)},`,
    `  ${createdAt ? sqlStr(createdAt) : 'now()'}, ${updatedAt ? sqlStr(updatedAt) : 'now()'}`,
    `) ON CONFLICT (event_id, user_key) DO NOTHING;`,
  ].join('\n'));
}

log(`出欠回答: ${responsesInserts.length} 件（スキップ: ${skippedResponses} 件）`);

// ─── 4. Config 変換 ─────────────────────────────────────────────

log('設定変換中...');

const configMap = {};
for (const row of configRows) {
  const k = (row['key'] || '').trim();
  const v = (row['value'] || '').trim();
  if (k) configMap[k] = v;
}

const configInserts = [];

// SHOW_ONLY_FUTURE_EVENTS の真偽値を反転して SHOW_ALL_EVENTS へ
if ('SHOW_ONLY_FUTURE_EVENTS' in configMap) {
  const src = configMap['SHOW_ONLY_FUTURE_EVENTS'];
  const dst = src === 'true' ? 'false' : 'true';
  configInserts.push(
    `-- SHOW_ONLY_FUTURE_EVENTS=${src} → SHOW_ALL_EVENTS=${dst}（反転）`,
    `INSERT INTO config (space_id, key, value)`,
    `VALUES (${sqlStr(spaceId)}, 'SHOW_ALL_EVENTS', ${sqlStr(dst)})`,
    `ON CONFLICT (space_id, key) DO UPDATE SET value = EXCLUDED.value;`,
  );
}

for (const key of ['DISPLAY_START_DATE', 'DISPLAY_END_DATE']) {
  if (configMap[key]) {
    configInserts.push(
      `INSERT INTO config (space_id, key, value)`,
      `VALUES (${sqlStr(spaceId)}, ${sqlStr(key)}, ${sqlStr(configMap[key])})`,
      `ON CONFLICT (space_id, key) DO UPDATE SET value = EXCLUDED.value;`,
    );
  }
}

const configInsertCount = configInserts.filter(l => l.startsWith('INSERT')).length;
log(`設定: ${configInsertCount} 件`);

// ─── SQL 出力 ───────────────────────────────────────────────────

const out = [
  '-- ============================================================',
  '-- GAS → union-board 移行 SQL',
  `-- 生成日時: ${new Date().toISOString()}`,
  `-- space_id: ${spaceId}`,
  '-- ============================================================',
  '',
  'BEGIN;',
  '',
  '-- ============================================================',
  '-- 1. Members',
  '-- ============================================================',
  '',
  membersInserts.join('\n\n'),
  '',
  '-- ============================================================',
  '-- 2. Events',
  '-- ============================================================',
  '',
  eventsInserts.join('\n\n'),
  '',
  '-- ============================================================',
  '-- 3. Responses',
  '-- ============================================================',
  '',
  responsesInserts.join('\n\n'),
  '',
  '-- ============================================================',
  '-- 4. Config',
  '-- ============================================================',
  '',
  configInserts.join('\n'),
  '',
  'COMMIT;',
  '',
  `-- 件数サマリー`,
  `-- Members:   ${membersInserts.length} 件`,
  `-- Events:    ${eventsInserts.length} 件`,
  `-- Responses: ${responsesInserts.length} 件（スキップ: ${skippedResponses} 件）`,
  `-- Config:    ${configInsertCount} 件`,
].join('\n');

process.stdout.write(out + '\n');
log('SQL 出力完了');
