import { it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const {load}=createRequire(import.meta.url)('js-yaml')
it('preserves profiles on Windows uninstall for both editions',()=>{
  for(const file of ['electron-builder.yml','electron-builder.corp.yml'])expect(load(readFileSync(file,'utf8')).nsis.deleteAppDataOnUninstall).toBe(false)
})
it('publishes the Corp desktop entrypoint/resources instead of the personal application',()=>{
  const corp=load(readFileSync('electron-builder.corp.yml','utf8'))
  expect(corp.extraMetadata.main).toBe('./out/main/index-corp.js')
  expect(corp.files).toContain('out/main/**')
  expect(corp.publish.repo).toBe('keepmind-corp')
  const flow=load(readFileSync('.github/workflows/continuous.yml','utf8'))
  const steps=flow.jobs.build.steps
  expect(steps.find((s:any)=>s.run?.startsWith('npx electron-builder')).run).toContain("github.repository == 'criptogus/keepmind-corp' && '--config electron-builder.corp.yml'")
  expect(steps.some((s:any)=>s.run==='npm run corp:build-brain' && s.if.includes('keepmind-corp'))).toBe(true)
  expect(steps.find((s:any)=>s.uses?.startsWith('actions/upload-artifact')).with.path).toContain("'dist-corp' || 'dist'")
})

const unsignedLaunchHelp = 'Builds are not code-signed yet. On macOS 15 or later, open the app once, then go to System Settings > Privacy & Security and choose Open Anyway. On macOS 14 or earlier, you can also right-click the app and choose Open. On Windows, choose More info, then Run anyway.'

it('keeps canonical first-launch help in docs, the app and the deployed landing page', () => {
  for (const file of [
    'README.md', 'docs/INSTALL.md', 'docs/RELEASE-NOTES-UNSIGNED.md',
    'src/renderer/src/components/Settings.tsx', 'site/index.html'
  ]) {
    const source = readFileSync(file, 'utf8').replaceAll('&gt;', '>').replaceAll('&amp;', '&')
    expect(source, file).toContain(unsignedLaunchHelp)
  }
})

it('never offers right-click Open without the macOS 15 first-launch flow', async () => {
  const { readdirSync } = await import('node:fs')
  const { join } = await import('node:path')
  const filesUnder = (path: string): string[] => readdirSync(path, { withFileTypes: true }).flatMap(entry => {
    const file = join(path, entry.name)
    return entry.isDirectory() ? filesUnder(file) : /\.(md|html|tsx?|jsx?)$/.test(file) ? [file] : []
  })
  const files = ['README.md', 'CHANGELOG.md', 'tools/README.md', 'corp/README.md',
    ...['docs', 'src/renderer', 'corp/public', 'site'].flatMap(filesUnder)]
  for (const file of files) {
    const source = readFileSync(file, 'utf8').replaceAll('&gt;', '>').replaceAll('&amp;', '&')
    for (const match of source.matchAll(/right[ -]click[^.\n]{0,160}\bOpen\b/gi)) {
      // Require the modern flow in the same paragraph/instruction, not elsewhere in the file.
      const preceding = source.slice(Math.max(0, match.index! - 400), match.index)
      expect(preceding, file).toContain('On macOS 15 or later, open the app once, then go to System Settings > Privacy & Security and choose Open Anyway.')
      expect(preceding, file).toContain('On macOS 14 or earlier')
    }
  }
})
