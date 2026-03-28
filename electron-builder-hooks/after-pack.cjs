const { execFileSync } = require('node:child_process')

exports.default = async function afterPack(context) {
  if (process.platform !== 'darwin' || !context.appOutDir) {
    return
  }

  execFileSync('xattr', ['-cr', context.appOutDir], {
    stdio: 'inherit',
  })
}
