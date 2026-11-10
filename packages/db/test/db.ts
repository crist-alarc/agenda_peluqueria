import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

/**
 * Base de datos de pruebas: crea una base nueva, aplica el stub de Supabase y
 * todas las migraciones en orden. Requiere un PostgreSQL accesible en
 * TEST_DATABASE_URL (por defecto postgres://postgres:postgres@localhost:5432/postgres).
 */
const ADMIN_URL = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/postgres';
const MIGRATIONS_DIR = join(import.meta.dirname, '..', 'supabase', 'migrations');

export async function createTestDatabase(): Promise<{ url: string; drop: () => Promise<void> }> {
  const name = `agenda_test_${process.pid}_${Date.now()}`;
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`create database ${name}`);
  await admin.end();

  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  await client.query(readFileSync(join(import.meta.dirname, 'supabase-stub.sql'), 'utf8'));
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
    try {
      await client.query(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
    } catch (error) {
      throw new Error(`Falló la migración ${file}: ${(error as Error).message}`);
    }
  }
  await client.end();

  return {
    url: url.toString(),
    drop: async () => {
      const a = new pg.Client({ connectionString: ADMIN_URL });
      await a.connect();
      await a.query(`drop database if exists ${name} with (force)`);
      await a.end();
    },
  };
}

/** Cliente que ejecuta cada operación como un usuario concreto (o anónimo), igual que PostgREST. */
export class Session {
  constructor(
    private readonly pool: pg.Pool,
    readonly userId: string | null,
    /** 'service_role' simula al servidor de la app usando la clave de servicio. */
    readonly role: 'anon' | 'authenticated' | 'service_role' = userId ? 'authenticated' : 'anon',
  ) {}

  async query<T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify(this.userId ? { sub: this.userId, role: this.role } : { role: this.role }),
      ]);
      await client.query(`set local role ${this.role}`);
      const result = await client.query<T>(sql, params);
      await client.query('commit');
      return result.rows;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }
}

/** Crea un usuario de Supabase Auth (como lo haría el registro). */
export async function createUser(pool: pg.Pool, email: string, fullName = email): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), $1, $2) returning id`,
    [email, JSON.stringify({ full_name: fullName })],
  );
  return rows[0]!.id;
}
