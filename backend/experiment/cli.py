"""Offline admin bootstrap and SQLite backup. Secrets read via getpass, never argv."""
import argparse
import getpass
import os
from pathlib import Path
import sqlite3
from werkzeug.security import generate_password_hash
from .store import Store
from .audit import uid


def main():
    p=argparse.ArgumentParser()
    p.add_argument('command',choices=['bootstrap','backup','check-backup'])
    p.add_argument('--db',default=os.environ.get('EXPERIMENT_DB'))
    p.add_argument('--username',default='captain')
    p.add_argument('--output')
    args=p.parse_args()
    if not args.db: p.error('--db or EXPERIMENT_DB is required')
    if args.command=='bootstrap':
        store=Store(args.db)
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
    else:
        db=sqlite3.connect(f'file:{Path(args.db).resolve()}?mode=ro',uri=True)
        print('SQLite integrity:',db.execute('PRAGMA integrity_check').fetchone()[0]); db.close()

if __name__=='__main__': main()
