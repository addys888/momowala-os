import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const dir = join(tmpdir(), 'momowala-isolated-tests');
const port = process.env.TEST_PG_PORT || '55439';
const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit' });
if (!existsSync(join(dir, 'PG_VERSION'))) run('initdb', ['-D', dir, '-A', 'trust', '--locale=C', '--encoding=UTF8']);
try { execFileSync('pg_ctl', ['-D', dir, 'status'], { stdio: 'ignore' }); }
catch { run('pg_ctl', ['-D', dir, '-l', join(dir, 'server.log'), '-o', `-h 127.0.0.1 -p ${port}`, 'start']); }
const args = ['-h', '127.0.0.1', '-p', port, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'];
run('psql', [...args, '-c', "do $$ begin if not exists(select from pg_roles where rolname='anon') then create role anon; end if; if not exists(select from pg_roles where rolname='authenticated') then create role authenticated; end if; end $$;"]);
run('psql', [...args, '-f', 'supabase/schema.sql']);
console.log(`Local fixture database ready. Stop with: pg_ctl -D '${dir}' stop`);
