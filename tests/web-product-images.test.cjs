const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function loadImageActions(overrides = {}) {
  const source = fs.readFileSync('src/components/admin/WebProductsWorkspace.tsx', 'utf8');
  const tree = ts.createSourceFile('WebProductsWorkspace.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const wanted = new Set(['uploadSelectedImage', 'handleImageInputChange', 'handleImageDrop', 'handleImagePaste', 'handlePasteFromClipboardButton']);
  const declarations = [];
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name && wanted.has(node.name.text)) declarations.push(node.getText(tree));
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.equal(declarations.length, wanted.size);
  const js = ts.transpileModule(declarations.join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  const context = {
    File, crypto: { randomUUID: () => 'test-id' }, auth: { currentUser: {} }, activeUploadSlot: 2,
    navigator: {}, fileInputRef: { current: { value: '' } }, output: {}, console,
    setUploadingImage: value => { context.output.uploading = value; },
    setDraggingImage: value => { context.output.dragging = value; },
    setError: value => { context.output.error = value; },
    setNotice: value => { context.output.notice = value; },
    setImagePreviewError: value => { context.output.previewError = value; },
    setSlotUrl: (slot, url) => { context.output.slot = slot; context.output.url = url; },
    compressProductImageClient: async () => new File(['optimized'], 'photo.webp', { type: 'image/webp' }),
    withPrefix: (prefix, name) => `carlitos/${prefix}/${name}`,
    uploadFile: async (path, file) => { context.output.uploadPath = path; context.output.uploadType = file.type; return { url: 'https://example.test/photo.webp' }; },
    ...overrides,
  };
  vm.createContext(context);
  vm.runInContext(js, context);
  return context;
}

test('sube archivo comprimido al Storage y conserva la foto elegida', async () => {
  const c = loadImageActions();
  await c.uploadSelectedImage(new File(['raw'], 'source.png', { type: 'image/png' }), 3);
  assert.equal(c.output.uploadPath, 'carlitos/products/test-id.webp');
  assert.equal(c.output.uploadType, 'image/webp');
  assert.equal(c.output.slot, 3);
  assert.equal(c.output.url, 'https://example.test/photo.webp');
  assert.equal(c.output.uploading, false);
});

test('pega una imagen copiada en la posición activa', async () => {
  const c = loadImageActions();
  const file = new File(['raw'], 'clipboard.png', { type: 'image/png' });
  let prevented = false;
  c.handleImagePaste({ clipboardData: { items: [{ type: 'image/png', getAsFile: () => file }] }, preventDefault: () => { prevented = true; } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(prevented, true);
  assert.equal(c.output.slot, 2);
  assert.equal(c.output.url, 'https://example.test/photo.webp');
});

test('pegar un enlace en el panel lo usa sin interceptar campos de texto', () => {
  const c = loadImageActions();
  let prevented = false;
  const event = { clipboardData: { items: [], getData: () => 'https://example.test/image.png' }, target: { closest: () => null }, preventDefault: () => { prevented = true; } };
  c.handleImagePaste(event);
  assert.equal(prevented, true);
  assert.equal(c.output.url, 'https://example.test/image.png');
  c.output.url = 'unchanged';
  c.handleImagePaste({ ...event, target: { closest: () => ({}) } });
  assert.equal(c.output.url, 'unchanged');
});

test('informa falta de sesión sin enviar el archivo', async () => {
  const c = loadImageActions({ auth: { currentUser: null } });
  await c.uploadSelectedImage(new File(['raw'], 'image.png', { type: 'image/png' }));
  assert.match(c.output.error, /Inicia sesión/);
  assert.equal(c.output.uploadPath, undefined);
});

test('el botón de pegar acepta un enlace copiado', async () => {
  const c = loadImageActions({ navigator: { clipboard: { read: async () => [{ types: ['text/plain'], getType: async () => new Blob(['https://example.test/image.png']) }] } } });
  await c.handlePasteFromClipboardButton();
  assert.equal(c.output.slot, 2);
  assert.equal(c.output.url, 'https://example.test/image.png');
});

test('permite pegar enlaces si el navegador solo admite lectura de texto', async () => {
  const c = loadImageActions({ navigator: { clipboard: { readText: async () => 'https://example.test/image.png' } } });
  await c.handlePasteFromClipboardButton();
  assert.equal(c.output.url, 'https://example.test/image.png');
});
