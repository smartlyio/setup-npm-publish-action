import * as core from '@actions/core'
import * as exec from '@actions/exec'

import * as path from 'path'
import * as process from 'process'
import {constants, promises as fs} from 'fs'

export function getEnv(name: string): string {
  const value: string | undefined = process.env[name]
  if (value === undefined) {
    throw new Error(`No ${name} environment variable set`)
  }
  return value
}

export function getSshPath(name: string): string {
  const temp = getEnv('RUNNER_TEMP')
  return path.join(temp, 'setup-npm-publish-action', name)
}

export async function sshKeyscan(): Promise<string> {
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
  await exec.exec('ssh-keyscan', ['-t', 'rsa', 'github.com'], options)
  core.info(`Stderr from ssh-keyscan: ${stderr}`)
  return stdout
}

export async function npmSet(
  cwd: string,
  key: string,
  value: string
): Promise<void> {
  const options = {cwd}

  await exec.exec(
    'npm',
    ['config', 'delete', '--location', 'project', key],
    options
  )
  await exec.exec(
    'npm',
    ['config', 'set', '--location', 'project', key, value],
    options
  )
}

export async function updateNpmrc(
  npmrcPath: string,
  contents: string | null
): Promise<void> {
  const npmrcDirectory = path.dirname(path.resolve(npmrcPath))

  if (contents) {
    const lines = contents.trim().split('\n')

    core.info(`Updating npm configuration ${npmrcPath}`)
    for (const line of lines) {
      if (line.match(/^\s*#/)) {
        continue
      }
      const match = line.match(
        /^(?<key>[^=]+?)\s*=\s*(?<value>.*?)(?<comment> #.*)?$/
      )
      if (match && match.groups) {
        const key = match.groups.key
        const value = match.groups.value
        if (key.match(/(^|:)always-auth$/)) {
          core.warning(
            'always-auth is not supported by npm config set; writing it manually to the file'
          )
          await fs.appendFile(npmrcPath, `\n${key} = ${value}\n`)
        } else {
          await npmSet(npmrcDirectory, key, value)
        }
      }
    }
  }
}

export async function setupNpmPublish(
  email: string,
  username: string,
  deployKey: string | null,
  token: string | null,
  npmrcPath: string,
  npmrcDidExist: boolean
): Promise<void> {
  const keyPath = getSshPath('id_rsa')
  const knownHostsPath = getSshPath('known_hosts')
  const sshDir = path.dirname(keyPath)
  await fs.mkdir(sshDir, {recursive: true})

  await updateNpmrc(npmrcPath, token)

  core.info(`Marking ${npmrcPath} as unmodified to avoid committing the keys`)
  if (npmrcDidExist) {
    await exec.exec('git', ['update-index', '--assume-unchanged', npmrcPath])
  } else {
    core.info(`${npmrcPath} did not exist before running the action`)
    // Mark it as excluded locally
    try {
      await fs.access('.git/info/exclude', constants.F_OK)
      await fs.appendFile('.git/info/exclude', `\n${npmrcPath}\n`)
    } catch {
      core.info('The .git folder does not exist')
    }
  }

  if (deployKey) {
    core.info(`Writing deploy key to ${keyPath}`)
    await fs.writeFile(keyPath, `${deployKey}\n`, {mode: 0o400})

    core.info('Running ssh-keyscan for github.com')
    const githubKey = await sshKeyscan()
    await fs.writeFile(knownHostsPath, githubKey)

    core.info('Setting up git config for commit user')
    await exec.exec('git', ['config', 'user.email', email])
    await exec.exec('git', ['config', 'user.name', username])

    core.info('Setting up git config for ssh command')
    const sshCommand = `ssh -i ${sshDir}/id_rsa -o UserKnownHostsFile=${sshDir}/known_hosts`
    await exec.exec('git', ['config', 'core.sshCommand', sshCommand])

    core.info('Setting git remote url')
    const repoFullName = process.env['GITHUB_REPOSITORY']
    const origin = `git@github.com:${repoFullName}.git`
    await exec.exec('git', ['remote', 'set-url', 'origin', origin])
  } else {
    core.saveState('skipGitDeployKey', 'true')
    core.info('skipping git setup: GIT_DEPLOY_KEY not provided')
  }
}

export async function cleanupNpmPublish(
  npmrcPath: string,
  npmrcInGitExcluded: boolean
): Promise<void> {
  const gitDeploySkipped = core.getState('skipGitDeployKey') === 'true'

  core.info('Shredding files containing secrets')

  if (!gitDeploySkipped) {
    const keyPath = getSshPath('id_rsa')
    const knownHosts = getSshPath('known_hosts')
    await exec.exec('shred', ['-zuf', keyPath])
    await exec.exec('shred', ['-zuf', knownHosts])
  }

  let isGitRepo = true
  try {
    await exec.exec('git', ['rev-parse', '--is-inside-work-tree'])
  } catch {
    isGitRepo = false
  }

  if (npmrcInGitExcluded || !isGitRepo) {
    await exec.exec('shred', ['-zfu', npmrcPath])
  } else {
    await exec.exec('shred', ['-zf', npmrcPath])
    await exec.exec('git', ['update-index', '--no-assume-unchanged', npmrcPath])
    await exec.exec('git', ['checkout', '--', npmrcPath])
  }

  if (isGitRepo && !gitDeploySkipped) {
    core.info('Unsetting git config')
    await exec.exec('git', ['config', '--unset', 'user.email'])
    await exec.exec('git', ['config', '--unset', 'user.name'])
    await exec.exec('git', ['config', '--unset', 'core.sshCommand'])

    core.info('Resetting git remote url')
    const repoFullName = process.env['GITHUB_REPOSITORY']
    const origin = `https://github.com/${repoFullName}`
    await exec.exec('git', ['remote', 'set-url', 'origin', origin])
  }
}
