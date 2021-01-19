import * as core from '@actions/core'
import * as exec from '@actions/exec'

import * as process from 'process'
import * as path from 'path'
import {promises as fs} from 'fs'

export function getEnv(name: string): string {
  const value: string | undefined = process.env[name]
  if (value === undefined) {
    throw new Error(`No ${name} environment variable set`)
  }
  return value
}

export function getSshPath(name: string): string {
  const home = getEnv('HOME')
  return path.join(home, '.ssh', name)
}

async function sshKeyscan(): Promise<string> {
  let stderr = ''
  let stdout = ''
  const options: exec.ExecOptions = {}
  options.listeners = {
    stdout: (data: Buffer) => {
      stdout += data.toString()
    },
    stderr: (data: Buffer) => {
      stderr += data.toString()
    }
  }
  core.warning(`Stderr from ssh-keyscan: ${stderr}`)
  return stdout
}

export async function setupNpmPublish(
  email: string,
  username: string,
  deployKey: string,
  token: string
): Promise<void> {
  const home = getEnv('HOME')
  const keyPath = getSshPath('id_rsa')
  const knownHostsPath = getSshPath('known_hosts')
  await fs.mkdir(keyPath)

  core.info(`Writing deploy key to ${keyPath}`)
  await fs.writeFile(keyPath, deployKey, {mode: 0o400})

  core.info(`Writing token file to .npmrc`)
  await fs.writeFile('.npmrc', token)
  // Is this still needed?
  await fs.appendFile('.npmrc', 'unsafe-perm = true')

  core.info('Running ssh-keyscan for github.com')
  const githubKey = await sshKeyscan()
  await fs.writeFile(knownHostsPath, githubKey)

  core.info('Marking .npmrc as unmodified to avoid committing the keys')
  await exec.exec('git', ['update-index', '--assume-unchanged', '.npmrc'])

  core.info('Setting up git config for commit user')
  await exec.exec('git', ['config', 'user.email', email])
  await exec.exec('git', ['config', 'user.name', username])

  core.info('Setting up git config for ssh command')
  const sshCommand = `ssh -i ${home}/.ssh/id_rsa -o UserKnownHostsFile=${home}/.ssh/known_hosts`
  await exec.exec('git', ['config', 'core.sshCommand', sshCommand])
}

export async function cleanupNpmPublish(): Promise<void> {
  const keyPath = getSshPath('id_rsa')
  const knownHosts = getSshPath('known_hosts')

  core.info('Shredding files containing secrets')
  await exec.exec('shred', ['-zuf', keyPath])
  await exec.exec('shred', ['-zuf', knownHosts])
  await exec.exec('shred', ['-zf', '.npmrc'])

  core.info('Resetting .npmrc')
  await exec.exec('git', ['update-index', '--no-assume-unchanged', '.npmrc'])
  await exec.exec('git', ['checkout', '.npmrc'])

  core.info('Unsettings git config')
  await exec.exec('git', ['config', '--unset', 'user.email'])
  await exec.exec('git', ['config', '--unset', 'user.name'])
  await exec.exec('git', ['config', '--unset', 'core.sshCommand'])
}
