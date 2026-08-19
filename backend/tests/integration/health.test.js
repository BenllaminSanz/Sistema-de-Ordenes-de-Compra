import { it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { describeIntegration } from '../helpers/integration.js';
import { getApp } from '../helpers/app.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(__dirname, '../../package.json'), 'utf8')
);

describeIntegration('Health', () => {
  it('GET /api/health devuelve ok y version del package.json', async () => {
    const res = await request(getApp()).get('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.estado, 'ok');
    assert.equal(res.body.version, pkg.version);
    assert.ok(res.body.timestamp);
    assert.ok(res.body.frontend_url);
    assert.equal(typeof res.body.notif_req_revision, 'boolean');
  });
});
