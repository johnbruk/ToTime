#!/usr/bin/env bash
# Esegue i test del modello Cliente -> Commessa -> Progetto -> WBS su
# un PostgreSQL locale usa e getta. Non tocca Supabase.
#
#   tests/db/run.sh
#
# Richiede postgresql-16 installato. Crea il cluster in
# /var/lib/postgresql/totime e lo lascia acceso per le esecuzioni
# successive.
set -euo pipefail
PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
PGD=${PGD:-/var/lib/postgresql/totime}
RUN=${RUN:-/var/lib/postgresql/run}
PORT=${PORT:-54329}
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"

if ! pg_isready -h "$RUN" -p "$PORT" >/dev/null 2>&1; then
  echo "avvio PostgreSQL locale..."
  mkdir -p "$PGD" "$RUN"; chown -R postgres:postgres "$PGD" "$RUN"
  [ -f "$PGD/PG_VERSION" ] || su postgres -c "$PGBIN/initdb -D $PGD -U postgres --auth=trust" >/dev/null
  su postgres -c "$PGBIN/pg_ctl -D $PGD -o '-p $PORT -k $RUN' -l $PGD/server.log start" >/dev/null
  sleep 2
fi

pass=0; fail=0
run_db () {                      # $1 = nome db, $2... = file .sql
  local db="$1"; shift
  dropdb -h "$RUN" -p "$PORT" -U postgres "$db" 2>/dev/null || true
  createdb -h "$RUN" -p "$PORT" -U postgres "$db"
  psql -h "$RUN" -p "$PORT" -U postgres -d "$db" -q -v ON_ERROR_STOP=1 -f "$HERE/base-schema.sql" >/dev/null
  psql -h "$RUN" -p "$PORT" -U postgres -d "$db" -q -v ON_ERROR_STOP=1 -f "$ROOT/migrations/2026-09-09_commesse-progetti-wbs.sql" >/dev/null 2>&1
  # anche le correzioni per gli advisor: si prova quello che finisce in produzione
  for extra in 2026-09-10_advisor-fix.sql \
               2026-09-10_advisor-fix-2-rls-performance.sql \
               2026-09-10_advisor-fix-3-rls-tabelle-storiche.sql \
               2026-09-10_completamento.sql \
               2026-09-10_inversione-progetto-commessa.sql; do
    psql -h "$RUN" -p "$PORT" -U postgres -d "$db" -q -v ON_ERROR_STOP=1 -f "$ROOT/migrations/$extra" >/dev/null 2>&1
  done
  for f in "$@"; do
    out=$(psql -h "$RUN" -p "$PORT" -U postgres -d "$db" -q -f "$f" 2>&1 |
          sed 's/^psql.*NOTICE:  //;s/^psql.*ERROR:/  KO  ERRORE SQL:/' |
          grep -v "^CONTEXT\|^DETAIL\|^PL/pgSQL\|^SQL statement\|^HINT")
    echo "$out"
    pass=$((pass + $(grep -c "^  OK  " <<<"$out" || true)))
    fail=$((fail + $(grep -c "^  KO  " <<<"$out" || true)))
  done
}

# L'inversione va provata partendo dal modello VECCHIO, come in
# produzione: questo setup si ferma prima di applicarla, ed e' il test
# stesso a lanciarla.
run_db_vecchio () {
  local db="$1"; shift
  dropdb -h "$RUN" -p "$PORT" -U postgres "$db" 2>/dev/null || true
  createdb -h "$RUN" -p "$PORT" -U postgres "$db"
  for f in "$HERE/base-schema.sql" "$ROOT/migrations/2026-09-09_commesse-progetti-wbs.sql" \
           "$ROOT/migrations/2026-09-10_completamento.sql"; do
    psql -h "$RUN" -p "$PORT" -U postgres -d "$db" -q -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>&1
  done
  for f in "$@"; do
    out=$(psql -h "$RUN" -p "$PORT" -U postgres -d "$db" -q -f "$f" 2>&1 |
          sed 's/^psql.*NOTICE:  //;s/^psql.*ERROR:/  KO  ERRORE SQL:/' |
          grep -v "^CONTEXT\|^DETAIL\|^PL/pgSQL\|^SQL statement\|^HINT")
    echo "$out"
    pass=$((pass + $(grep -c "^  OK  " <<<"$out" || true)))
    fail=$((fail + $(grep -c "^  KO  " <<<"$out" || true)))
  done
}

run_db totime_test "$HERE/wbs-model.sql"
run_db totime_rls  "$HERE/wbs-rls.sql"
run_db totime_obbl "$HERE/wbs-obbligo.sql"
run_db totime_stor "$HERE/rls-storiche.sql"
run_db_vecchio totime_inv "$HERE/inversione.sql"

echo ""
echo "RISULTATO: $pass OK / $fail KO"
[ "$fail" -eq 0 ]
