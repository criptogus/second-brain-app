import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { checkUpdateManifests } from '../scripts/check-update-manifests.mjs'
import { createRequire } from 'node:module'
const { dump } = createRequire(import.meta.url)('js-yaml')
const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })
function fixture(options: { actual?: string; url?: string; size?: number; sha512?: string; path?: string; legacySha?: string } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'keepmind-manifest-')); dirs.push(dir)
  const bytes = Buffer.from('installer fixture')
  const url = options.url ?? 'KeepMind-SB-Setup-0.2.7.exe'
  const sha512 = createHash('sha512').update(bytes).digest('base64')
  writeFileSync(join(dir, options.actual ?? url), bytes)
  const manifest = { files: [{ url, size: options.size ?? bytes.length, sha512: options.sha512 ?? sha512 }], path: options.path ?? url, sha512: options.legacySha ?? sha512 }
  for (const name of ['latest.yml', 'latest-mac.yml']) writeFileSync(join(dir, name), dump(manifest))
  return dir
}
describe('post-build update manifest checker', () => {
  it('accepts exact names, sizes and base64 SHA-512 in every manifest', async () => {
    await expect(checkUpdateManifests(fixture())).resolves.toBe(2)
  })
  it.each([
    ['KeepMind-Setup-0.2.6.exe', 'KeepMind.Setup.0.2.6.exe'],
    ['KeepMind-Corp-0.2.6-arm64.dmg', 'KeepMind.Corp-0.2.6-arm64.dmg'],
    ['KeepMind-Corp-Setup-0.2.6.exe', 'KeepMind.Corp.Setup.0.2.6.exe']
  ])('rejects historical manifest %s when GitHub uploaded %s', async (url, actual) => {
    await expect(checkUpdateManifests(fixture({ url, actual }))).rejects.toThrow('exact asset filename missing')
  })
  it.each([
    [{ size: 1 }, 'size mismatch'],
    [{ sha512: 'wrong' }, 'sha512 mismatch'],
    [{ legacySha: 'wrong' }, 'sha512 mismatch'],
    [{ path: 'missing.exe' }, 'path has no matching'],
    [{ url: 'KeepMind Setup.exe' }, 'unsafe asset name'],
    [{ url: 'KeepMind+Setup.exe' }, 'unsafe asset name']
  ] as const)('rejects invalid metadata %j', async (options, message) => {
    await expect(checkUpdateManifests(fixture(options))).rejects.toThrow(message)
  })
  it('rejects a directory without manifests', async () => {
    const dir = fixture(); rmSync(join(dir, 'latest.yml')); rmSync(join(dir, 'latest-mac.yml'))
    await expect(checkUpdateManifests(dir)).rejects.toThrow('No latest*.yml')
  })
})
