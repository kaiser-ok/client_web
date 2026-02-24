#!/usr/bin/env bash
#
# sync-odoo-mirror.sh
# 從遠端 Odoo (192.168.30.138) pg_dump 全量同步到本地 mirror (localhost:5432/odoo)
# 建議透過 cron 每天凌晨 2:00 執行
#

set -euo pipefail

# ── 設定 ──────────────────────────────────────────────
REMOTE_HOST="192.168.30.138"
REMOTE_PORT="5432"
REMOTE_DB="odoo"
REMOTE_USER="proj"
REMOTE_PASSWORD="p20j2ead0n1y"

LOCAL_HOST="localhost"
LOCAL_PORT="5432"
LOCAL_DB="odoo"
LOCAL_USER="odoo"

DUMP_FILE="/tmp/odoo_mirror.dump"
LOCK_FILE="/tmp/odoo-mirror-sync.lock"
LOG_DIR="/opt/client-web/logs"
LOG_FILE="$LOG_DIR/odoo-mirror-sync.log"

# ── 函式 ──────────────────────────────────────────────
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

cleanup() {
  rm -f "$DUMP_FILE"
  rm -f "$LOCK_FILE"
}

# ── Lock 檢查（防止重複執行）────────────────────────────
if [ -f "$LOCK_FILE" ]; then
  LOCK_PID=$(cat "$LOCK_FILE" 2>/dev/null || echo "")
  if [ -n "$LOCK_PID" ] && kill -0 "$LOCK_PID" 2>/dev/null; then
    log "ERROR: 同步正在執行中 (PID: $LOCK_PID)，跳過本次執行"
    exit 1
  else
    log "WARN: 發現過期的 lock file，清除後繼續"
    rm -f "$LOCK_FILE"
  fi
fi

echo $$ > "$LOCK_FILE"
trap cleanup EXIT

# ── 確保 log 目錄存在 ──────────────────────────────────
mkdir -p "$LOG_DIR"

log "========== 開始 Odoo Mirror 同步 =========="

# ── Step 1: 從遠端 pg_dump ─────────────────────────────
log "Step 1: 從遠端 $REMOTE_HOST 匯出資料庫 $REMOTE_DB ..."
export PGPASSWORD="$REMOTE_PASSWORD"

if ! pg_dump -h "$REMOTE_HOST" -p "$REMOTE_PORT" -U "$REMOTE_USER" -d "$REMOTE_DB" -Fc -f "$DUMP_FILE"; then
  log "ERROR: pg_dump 失敗"
  exit 1
fi

DUMP_SIZE=$(du -h "$DUMP_FILE" | cut -f1)
log "Step 1 完成: dump 檔案大小 $DUMP_SIZE"

# ── Step 2: 停止本地 Odoo 服務 ──────────────────────────
log "Step 2: 停止本地 Odoo 服務 ..."
if systemctl is-active --quiet odoo17 2>/dev/null; then
  sudo systemctl stop odoo17
  log "Step 2 完成: odoo17 已停止"
else
  log "Step 2 跳過: odoo17 服務未在執行中"
fi

# ── Step 3: pg_restore 還原到本地 ──────────────────────
log "Step 3: 還原資料庫到本地 $LOCAL_HOST:$LOCAL_PORT/$LOCAL_DB ..."
unset PGPASSWORD

if ! sudo -u odoo pg_restore \
  -h "$LOCAL_HOST" \
  -p "$LOCAL_PORT" \
  -U "$LOCAL_USER" \
  -d "$LOCAL_DB" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  "$DUMP_FILE" 2>&1; then
  # pg_restore 回傳非 0 不一定代表嚴重錯誤（例如 drop 不存在的物件會警告）
  log "WARN: pg_restore 有警告訊息（通常可忽略）"
fi

log "Step 3 完成: 資料庫已還原"

# ── Step 4: 重啟本地 Odoo 服務 ──────────────────────────
log "Step 4: 重啟本地 Odoo 服務 ..."
if systemctl list-unit-files odoo17.service &>/dev/null; then
  sudo systemctl start odoo17
  log "Step 4 完成: odoo17 已重新啟動"
else
  log "Step 4 跳過: odoo17 服務不存在"
fi

# ── Step 5: 驗證 ────────────────────────────────────────
log "Step 5: 驗證本地資料庫可讀取 ..."
export PGPASSWORD="$REMOTE_PASSWORD"
PARTNER_COUNT=$(psql -h "$LOCAL_HOST" -p "$LOCAL_PORT" -U proj -d "$LOCAL_DB" -t -A -c "SELECT count(*) FROM res_partner;" 2>/dev/null || echo "FAIL")
unset PGPASSWORD

if [ "$PARTNER_COUNT" = "FAIL" ]; then
  log "WARN: 驗證查詢失敗，請手動檢查"
else
  log "Step 5 完成: res_partner 共 $PARTNER_COUNT 筆"
fi

log "========== Odoo Mirror 同步完成 =========="
