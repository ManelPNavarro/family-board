import { readFile, writeFile } from 'node:fs/promises';

const config = JSON.parse(await readFile('wrangler.json', 'utf8'));
const { ACCESS_TEAM, ACCESS_AUD, D1_DATABASE_ID, GITHUB_SHA } = process.env;

if (!/^[0-9a-f]{40}$/.test(GITHUB_SHA ?? '')) {
  throw new Error('GITHUB_SHA debe ser el SHA completo del commit.');
}

if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(D1_DATABASE_ID ?? '')) {
  throw new Error('Configura la variable D1_DATABASE_ID con el ID de la base.');
}

config.d1_databases = [{
  binding: 'DB',
  database_name: 'family-board',
  database_id: D1_DATABASE_ID,
}];
config.vars.COMMIT_SHA = GITHUB_SHA;

// El primer despliegue crea el Worker sin habilitar su URL.
if (ACCESS_TEAM || ACCESS_AUD) {
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(ACCESS_TEAM ?? '') ||
      !/^[0-9a-f]{64}$/i.test(ACCESS_AUD ?? '')) {
    throw new Error('Configura ACCESS_TEAM y ACCESS_AUD para habilitar workers.dev.');
  }
  config.vars.ACCESS_ISSUER = `https://${ACCESS_TEAM}.cloudflareaccess.com`;
  config.vars.ACCESS_AUD = ACCESS_AUD;
  config.workers_dev = true;
}

await writeFile('.wrangler.deploy.json', JSON.stringify(config, null, 2));
