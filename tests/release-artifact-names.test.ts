import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
require('app-builder-lib') // Initialize its public entrypoint before internal helpers.
const { load } = require('js-yaml')
const { expandMacro } = require('app-builder-lib/out/util/macroExpander')
const { computeSafeArtifactNameIfNeeded } = require('app-builder-lib/out/platformPackager')
const { NsisTarget } = require('app-builder-lib/out/targets/nsis/NsisTarget')
const defaultPattern = Object.getOwnPropertyDescriptor(NsisTarget.prototype, 'installerFilenamePattern')!.get!.call({ isPortable: false })
const expand = (pattern: string, productName: string) => expandMacro(pattern, 'x64', { productName, version: '0.2.6' }, { ext: 'exe' }, false)

describe('Artifact names used by external GitHub publication', () => {
  it('reproduces the default NSIS filename/manifest mismatch', () => {
    const filename = expand(defaultPattern, 'KeepMind')
    expect(filename).toBe('KeepMind Setup 0.2.6.exe')
    expect(computeSafeArtifactNameIfNeeded(filename, () => '')).toBe('KeepMind-Setup-0.2.6.exe')
  })
  const version = JSON.parse(readFileSync('package.json', 'utf8')).version
  for (const file of ['electron-builder.yml', 'electron-builder.corp.yml']) {
    const config = load(readFileSync(file, 'utf8'))
    for (const platform of ['mac', 'win']) {
      for (const targetEntry of config[platform].target) {
        const target = typeof targetEntry === 'string' ? targetEntry : targetEntry.target
        const arches = new Set(['arm64', 'x64', ...(platform === 'mac' ? ['universal'] : []), ...(targetEntry.arch ?? [])])
        const ext = target === 'nsis' ? 'exe' : target
        const pattern = config[target]?.artifactName ?? config[platform]?.artifactName
        for (const arch of arches) {
          it(`${file}: ${target}/${arch} has an explicit GitHub-safe artifact name`, () => {
            expect(pattern).toBeTypeOf('string')
            expect(pattern.length).toBeGreaterThan(0)
            const filename = expandMacro(pattern, arch, {
              productName: config.productName, sanitizedProductName: config.productName,
              name: 'keepmind', version
            }, { ext, os: platform }, true)
            expect(filename).toMatch(/^[A-Za-z0-9._-]+$/)
            expect(filename.endsWith(`.${ext}`)).toBe(true)
            expect(computeSafeArtifactNameIfNeeded(filename, () => '')).toBeNull()
          })
        }
      }
    }
  }
})
