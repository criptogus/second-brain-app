import { createReadStream } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import yaml from 'js-yaml'

export async function checkUpdateManifests(distDir) {
  const names = await readdir(distDir)
  const manifests = names.filter(name => /^latest.*\.yml$/.test(name))
  if (!manifests.length) throw new Error(`No latest*.yml manifests in ${distDir}`)
  for (const manifest of manifests) {
    const data = yaml.load(await readFile(join(distDir, manifest), 'utf8'))
    const fail = message => { throw new Error(`${manifest}: ${message}`) }
    if (!data || !Array.isArray(data.files) || !data.files.length) fail('missing files entries')
    const verify = async (name, size, sha512) => {
      if (typeof name !== 'string' || !/^[A-Za-z0-9._-]+$/.test(name) || name === '.' || name === '..') fail(`unsafe asset name: ${JSON.stringify(name)}`)
      if (!names.includes(name)) fail(`exact asset filename missing: ${name}`)
      const info = await stat(join(distDir, name))
      if (!info.isFile()) fail(`asset is not a file: ${name}`)
      if (!Number.isSafeInteger(size) || size < 0 || info.size !== size) fail(`size mismatch for ${name}: manifest ${size}, actual ${info.size}`)
      const hash = createHash('sha512')
      for await (const chunk of createReadStream(join(distDir, name))) hash.update(chunk)
      if (typeof sha512 !== 'string' || hash.digest('base64') !== sha512) fail(`sha512 mismatch for ${name}`)
    }
    for (const file of data.files) {
      if (!file || typeof file !== 'object') fail('invalid files entry')
      await verify(file.url, file.size, file.sha512)
    }
    if (data.path !== undefined) {
      const entry = data.files.find(file => file.url === data.path)
      if (!entry) fail(`path has no matching files entry: ${data.path}`)
      await verify(data.path, data.size ?? entry.size, data.sha512)
    }
  }
  return manifests.length
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (!process.argv[2]) throw new Error('Usage: node scripts/check-update-manifests.mjs <distDir>')
    console.log(`Validated ${await checkUpdateManifests(process.argv[2])} update manifest(s)`)
  } catch (error) {
    console.error(`Update manifest check failed: ${error.message}`)
    process.exitCode = 1
  }
}
