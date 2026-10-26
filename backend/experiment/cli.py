"""Offline admin bootstrap and SQLite backup. Secrets read via getpass, never argv."""
import argparse
import getpass
import os
from pathlib import Path
import sqlite3
import json
from werkzeug.security import generate_password_hash
from .store import Store
from .postgres_store import PostgresStore
from .audit import uid


def main():
    p=argparse.ArgumentParser()
    p.add_argument('command',choices=['bootstrap','backup','check-backup','verify'])
    p.add_argument('--db',default=os.environ.get('EXPERIMENT_DB'))
    p.add_argument('--username',default='captain')
    p.add_argument('--output')
    args=p.parse_args()
    dsn = os.environ.get('EXPERIMENT_DATABASE_URL') or os.environ.get('DATABASE_URL')
    if not args.db and not dsn: p.error('EXPERIMENT_DB or DATABASE_URL is required')
    if dsn and args.command in ('backup','check-backup'):
        p.error('PostgreSQL backup/check-backup must use external Neon point-in-time recovery or pg_dump; SQLite backup is not applicable')
    if args.command=='bootstrap':
        store=PostgresStore(dsn) if dsn else Store(args.db)
        password=getpass.getpass('New administrator password (12+ chars): ')
        if not 12<=len(password)<=128: p.error('password length must be 12..128')
        if password!=getpass.getpass('Confirm: '): p.error('password confirmation mismatch')
        with store.tx() as db:
            if db.execute("SELECT 1 FROM users WHERE role='admin'").fetchone(): p.error('administrator already exists; use authenticated account management')
            ident=uid()
            db.execute('INSERT INTO users(id,username,password_hash,role) VALUES(?,?,?,?)',(ident,args.username,generate_password_hash(password),'admin'))
            store.event(db,'admin_bootstrap',{'username':args.username},actor=ident)
        print('Administrator created. No experiment records generated.')
    elif args.command=='backup':
        if not args.output or Path(args.output).exists(): p.error('provide a NEW --output path')
        source=sqlite3.connect(f'file:{Path(args.db).resolve()}?mode=ro',uri=True)
        target=sqlite3.connect(args.output)
        source.backup(target); target.close(); source.close()
        os.chmod(args.output,0o600)
        print('Consistent SQLite backup saved. Store a copy and its hash on independent storage.')
    elif args.command=='verify':
        if not dsn and not Path(args.db).is_file(): p.error('database does not exist')
        store=PostgresStore(dsn) if dsn else Store(args.db)
        with store.tx(read=True) as db: result=store.verify(db)
        print(json.dumps(result,ensure_ascii=False,indent=2))
        if not result['ok']: raise SystemExit(1)
    else:
        db=sqlite3.connect(f'file:{Path(args.db).resolve()}?mode=ro',uri=True)
        print('SQLite integrity:',db.execute('PRAGMA integrity_check').fetchone()[0]); db.close()

if __name__=='__main__': main()
