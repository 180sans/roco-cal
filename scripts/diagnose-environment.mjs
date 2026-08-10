import { spawnSync } from 'node:child_process'

const names = ['USERPROFILE', 'APPDATA', 'LOCALAPPDATA']

function utf16(value) {
  if (value === undefined) return '<missing>'
  return Array.from(value, (character) =>
    character.codePointAt(0).toString(16).toUpperCase().padStart(4, '0'),
  ).join(' ')
}

console.log(`node=${process.execPath}`)
for (const name of names) {
  console.log(`node ${name}_utf16=${utf16(process.env[name])}`)
}

const child = spawnSync('cmd.exe', ['/d', '/u', '/c', 'set'], {
  encoding: 'buffer',
  windowsHide: true,
})

if (child.error) {
  console.error(`cmd child failed: ${child.error.message}`)
  process.exitCode = 1
} else {
  const variables = child.stdout
    .toString('utf16le')
    .split(/\r?\n/)
    .filter((line) => names.some((name) => line.startsWith(`${name}=`)))

  for (const name of names) {
    const entry = variables.find((line) => line.startsWith(`${name}=`))
    const value = entry?.slice(name.length + 1)
    console.log(`cmd child ${name}_utf16=${utf16(value)}`)
  }
}
