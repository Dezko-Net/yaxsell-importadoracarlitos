const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

const filename = path.resolve(__dirname, '../src/lib/module-access.ts');
const source = fs.readFileSync(filename, 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const loaded = new Module(filename, module);
loaded.filename = filename;
loaded.paths = module.paths;
loaded._compile(js, filename);
const { normalizeServiceModules, moduleForPath, changeServiceModule } = loaded.exports;

test('los tres servicios están disponibles inicialmente y se respetan estados guardados', () => {
  assert.deepEqual(normalizeServiceModules(undefined), { web: true, erp: true, pos: true });
  assert.deepEqual(normalizeServiceModules({ web: true, erp: false, pos: true }), { web: true, erp: false, pos: true });
});

test('cada Supreme puede cambiar los otros servicios pero no apagar el suyo', () => {
  for (const source of ['web', 'erp', 'pos']) {
    const current = { web: true, erp: true, pos: true };
    assert.throws(() => changeServiceModule(current, source, source, false), /CANNOT_DISABLE_CURRENT/);
    for (const target of ['web', 'erp', 'pos'].filter(value => value !== source)) {
      assert.equal(changeServiceModule(current, source, target, false)[target], false);
      assert.equal(changeServiceModule(current, source, target, false)[source], true);
    }
  }
});

test('un módulo apagado no puede modificar otros y los cambios conservan los demás estados', () => {
  const state = { web: true, erp: false, pos: true };
  assert.throws(() => changeServiceModule(state, 'erp', 'pos', false), /MODULE_DISABLED/);
  assert.deepEqual(changeServiceModule(state, 'web', 'pos', false), { web: true, erp: false, pos: false });
});

test('clasifica las rutas de cada módulo y deja accesible el inicio de sesión', () => {
  assert.equal(moduleForPath('/admin/login'), null);
  assert.equal(moduleForPath('/api/module-access'), null);
  assert.equal(moduleForPath('/admin/supreme-web'), 'web');
  assert.equal(moduleForPath('/productos'), 'web');
  assert.equal(moduleForPath('/admin-supreme'), 'erp');
  assert.equal(moduleForPath('/erp-dashboard'), 'erp');
  assert.equal(moduleForPath('/pos-acceso'), 'pos');
  assert.equal(moduleForPath('/pos-admin/sucursal/supreme'), 'pos');
});
