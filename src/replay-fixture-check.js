const fs = require('fs')
const path = require('path')
const { loadReplayFixture } = require('./replay')

function checkReplayFixtures({ fixtureDir = path.join(__dirname, '..', 'test', 'fixtures') } = {}) {
  const errors = []
  let files = []
  try {
    files = fs.readdirSync(fixtureDir)
      .filter((x) => x.startsWith('replay-') && x.endsWith('.json'))
      .sort()
  } catch (e) {
    return { ok: false, files: [], errors: [`replay fixture 目录不可读: ${fixtureDir} (${e.message})`] }
  }

  if (files.length === 0) {
    errors.push(`replay fixture 目录为空: ${fixtureDir}`)
    return { ok: false, files: [], errors }
  }

  for (const file of files) {
    const fullPath = path.join(fixtureDir, file)
    try {
      loadReplayFixture(fullPath)
    } catch (e) {
      errors.push(`${file}: ${e.message}`)
    }
  }

  return { ok: errors.length === 0, files, errors }
}

module.exports = { checkReplayFixtures }
