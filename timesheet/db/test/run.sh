#!/bin/sh
# Avvia un Postgres locale usa-e-getta, applica lo schema e lancia le prove
# sulle policy. Nessun contatto con Supabase.
set -e
DIR=$(cd "$(dirname "$0")" && pwd)
PGDATA=${PGDATA:-/tmp/pgts}
PGPORT=${PGPORT:-54329}
PGBIN=/usr/lib/postgresql/16/bin
PSQL="psql -h /tmp -p $PGPORT -U postgres -v ON_ERROR_STOP=1 -q"

if ! pg_isready -h /tmp -p "$PGPORT" >/dev/null 2>&1; then
  rm -rf "$PGDATA"; mkdir -p "$PGDATA"; chown postgres:postgres "$PGDATA"
  su postgres -c "$PGBIN/initdb -D $PGDATA -A trust -U postgres" >/dev/null
  su postgres -c "$PGBIN/pg_ctl -D $PGDATA -o '-p $PGPORT -k /tmp' -l /tmp/pg.log start" >/dev/null
  sleep 2
fi

$PSQL -c "drop database if exists timesheet_test" -d postgres
$PSQL -c "create database timesheet_test" -d postgres

$PSQL -d timesheet_test -f "$DIR/00_shim.sql" >/dev/null
$PSQL -d timesheet_test -f "$DIR/../0001_schema.sql" >/dev/null
echo "schema applicato"
psql -h /tmp -p "$PGPORT" -U postgres -d timesheet_test -v ON_ERROR_STOP=1 -q -f "$DIR/01_policies.sql"
