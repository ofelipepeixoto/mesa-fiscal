import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const source = fileURLToPath(new URL('../public/', import.meta.url));
const output = fileURLToPath(new URL('../dist/', import.meta.url));
const assets = [
  'marca.svg', 'exemplo-nfse.xml', 'exemplo-danfse.pdf', 'danfse-worker.js',
  'engine/danfse.wasm.gz', 'engine/wasm_exec.js', 'engine/SHA256SUMS',
  'engine/BUILD.txt', 'engine/LICENSE-Go.txt', 'engine/LICENSE-DANFSe.txt', 'engine/THIRD-PARTY.txt',
];
const policy = [
  "default-src 'none'", "script-src 'self' 'wasm-unsafe-eval'", "worker-src 'self' blob:",
  "style-src 'self'", "connect-src 'self'", "img-src 'self' data:", "font-src 'self'",
  "object-src 'none'", "base-uri 'none'", "form-action 'none'",
].join('; ');

async function publicFile(directory, path) {
  const resolved = await realpath(path);
  const name = relative(directory, resolved);
  if (!name || isAbsolute(name) || name.split(sep).some(part => part.startsWith('.'))) {
    throw new Error('A distribuição encontrou uma entrada fora da pasta pública.');
  }
  return resolved;
}

async function bundle(input, kind, destination, directory) {
  const result = await build({
    ...input, absWorkingDir: directory, bundle: true,
    plugins: [{name: 'arquivos-publicos', setup(context) {
      context.onLoad({filter: /.*/, namespace: 'file'}, async entry => {
        await publicFile(directory, entry.path);
      });
    }}], platform: 'browser', format: 'esm', target: 'es2022',
    write: false, logLevel: 'silent', minify: true, sourcemap: false, legalComments: 'inline',
  });
  if (result.outputFiles.length !== 1) throw new Error('O pacote deve conter um único arquivo por entrada.');
  const bytes = result.outputFiles[0].contents;
  const filename = 'mesa-' + createHash('sha256').update(bytes).digest('hex').slice(0, 20) + '.' + kind;
  await writeFile(join(destination, filename), bytes);
  return { filename, integrity: 'sha384-' + createHash('sha384').update(bytes).digest('base64') };
}

function replaceOnce(html, from, to) {
  if (html.split(from).length !== 2) throw new Error('Confira a entrada de distribuição em index.html: ' + from);
  return html.replace(from, to);
}

// A pasta de saída deve estar vazia para não publicar arquivos de builds anteriores.
export async function buildDistribution({ sourceDir = source, outputDir = output } = {}) {
  sourceDir = await realpath(sourceDir);
  await mkdir(join(outputDir, 'engine'), { recursive: true });
  const [js, css] = await Promise.all([
    bundle({ entryPoints: [join(sourceDir, 'app.mjs')] }, 'js', outputDir, sourceDir),
    bundle({ stdin: { contents: '@import "./styles.css";\n@import "./flows.css";', loader: 'css',
      resolveDir: sourceDir, sourcefile: 'mesa.css' } }, 'css', outputDir, sourceDir),
  ]);
  await Promise.all(assets.map(async item => copyFile(await publicFile(sourceDir, join(sourceDir, item)), join(outputDir, item))));
  let html = await readFile(await publicFile(sourceDir, join(sourceDir, 'index.html')), 'utf8');
  html = replaceOnce(html, '<meta charset="utf-8">', '<meta charset="utf-8">\n'
    + '<meta name="mesa-edicao" content="navegador"><meta name="referrer" content="no-referrer">\n'
    + '<meta http-equiv="Content-Security-Policy" content="' + policy + '">\n');
  html = replaceOnce(html, '<link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/flows.css">',
    '<link rel="stylesheet" href="/' + css.filename + '" integrity="' + css.integrity + '" crossorigin="anonymous">');
  html = replaceOnce(html, '<script type="module" src="/app.mjs"></script>',
    '<script type="module" src="/' + js.filename + '" integrity="' + js.integrity + '" crossorigin="anonymous"></script>');
  await writeFile(join(outputDir, 'index.html'), html);
  // Lido por hosts compatíveis com _headers. A política HTML protege também o Sites.
  await writeFile(join(outputDir, '_headers'), [
    '/*', '  Content-Security-Policy: ' + policy + "; frame-ancestors 'self' https://chatgpt.com",
    '  X-Content-Type-Options: nosniff', '  Referrer-Policy: no-referrer',
    '  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()', '',
  ].join('\n'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await rm(output, { recursive: true, force: true });
  await buildDistribution();
}
