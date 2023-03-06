// import {core} from '@actions/core';
import {getState} from '@actions/core'
import {exec} from '@actions/exec'
import * as fssync from 'fs'
import {promises as fs} from 'fs'
import * as path from 'path'
import {mocked} from 'jest-mock'

import {
  cleanupNpmPublish,
  getEnv,
  getSshPath,
  setupNpmPublish,
  sshKeyscan,
  UNSAFE_PERM
} from '../src/setup-npm-publish'

jest.mock('@actions/core', () => ({
  info: jest.fn(),
  warning: jest.fn(),
  saveState: jest.fn(),
  getState: jest.fn()
}))

jest.mock('@actions/exec', () => ({
  exec: jest.fn()
}))

let runnerTempDir: string | null = null
const originalDirectory = process.cwd()
const githubRepository = 'smartlyio/setup-npm-publish-action'
const OLD_ENV = process.env
beforeEach(() => {
  jest.resetAllMocks()
  runnerTempDir = fssync.mkdtempSync(
    path.join(originalDirectory, 'runner-temp')
  )
  process.chdir(runnerTempDir)
  process.env = {...OLD_ENV}
  process.env['RUNNER_TEMP'] = runnerTempDir
  process.env['GITHUB_REPOSITORY'] = githubRepository
})

afterEach(() => {
  process.chdir(originalDirectory)
  process.env = OLD_ENV
  fssync.rmSync(runnerTempDir as string, {recursive: true})
  runnerTempDir = null
})

describe('test npm-setup-publish', () => {
  describe('get env', () => {
    test('failure', () => {
      delete process.env['RUNNER_TEMP']
      expect(() => {
        getEnv('RUNNER_TEMP')
      }).toThrow()
    })

    test('gets env var', () => {
      expect(getEnv('RUNNER_TEMP')).toEqual(runnerTempDir)
    })
  })

  test('get ssh path', () => {
    const filePath = getSshPath('id_rsa')
    expect(filePath).toEqual(`${runnerTempDir}/setup-npm-publish-action/id_rsa`)
  })

  test('ssh-keyscan', async () => {
    const mockExec = mocked(exec)
    const callArgs = [
      'ssh-keyscan',
      ['-t', 'rsa', 'github.com'],
      expect.objectContaining({
        listeners: expect.objectContaining({
          stdout: expect.anything(),
          stderr: expect.anything()
        })
      })
    ]
    await sshKeyscan()

    expect(mockExec.mock.calls.length).toEqual(1)
    expect(mockExec.mock.calls[0]).toEqual(callArgs)
  })

  describe('setupNpmPublish', () => {
    test('non-null token', async () => {
      const repository = path.join(runnerTempDir as string, 'repo')
      await fs.mkdir(repository, {recursive: true})
      process.chdir(repository)
      await fs.writeFile('.npmrc', '')

      const email = 'user@example.com'
      const username = 'Example User'
      const deployKey = 'definitely an ssh key'
      const token = 'this is an npmrc file'

      await setupNpmPublish(email, username, deployKey, token, '.npmrc', true)

      const tokenData = await fs.readFile(path.join(repository, '.npmrc'))
      expect(tokenData.toString()).toEqual(`${token}
${UNSAFE_PERM}
`)

      const sshKeyData = await fs.readFile(
        path.join(runnerTempDir as string, 'setup-npm-publish-action', 'id_rsa')
      )
      expect(sshKeyData.toString()).toEqual(`${deployKey}\n`)

      const mockExec = mocked(exec)
      expect(mockExec.mock.calls.length).toEqual(6)

      expect(mockExec.mock.calls[0]).toEqual([
        'git',
        ['update-index', '--assume-unchanged', '.npmrc']
      ])
      expect(mockExec.mock.calls[1][0]).toEqual('ssh-keyscan')
      expect(mockExec.mock.calls[2]).toEqual([
        'git',
        ['config', 'user.email', email]
      ])
      expect(mockExec.mock.calls[3]).toEqual([
        'git',
        ['config', 'user.name', username]
      ])
      expect(mockExec.mock.calls[4]).toEqual([
        'git',
        [
          'config',
          'core.sshCommand',
          expect.stringContaining('UserKnownHostsFile')
        ]
      ])
      expect(mockExec.mock.calls[5]).toEqual([
        'git',
        [
          'remote',
          'set-url',
          'origin',
          `git@github.com:${githubRepository}.git`
        ]
      ])
    })

    test('null token', async () => {
      const repository = path.join(runnerTempDir as string, 'repo')
      await fs.mkdir(repository, {recursive: true})
      process.chdir(repository)
      await fs.writeFile('.npmrc', '')

      const email = 'user@example.com'
      const username = 'Example User'
      const deployKey = 'definitely an ssh key'
      const token = null

      await setupNpmPublish(email, username, deployKey, token, '.npmrc', true)

      const tokenData = await fs.readFile(path.join(repository, '.npmrc'))
      expect(tokenData.toString()).toEqual(`
${UNSAFE_PERM}
`)

      const sshKeyData = await fs.readFile(
        path.join(runnerTempDir as string, 'setup-npm-publish-action', 'id_rsa')
      )
      expect(sshKeyData.toString()).toEqual(`${deployKey}\n`)

      const mockExec = mocked(exec)
      expect(mockExec.mock.calls.length).toEqual(6)

      expect(mockExec.mock.calls[0]).toEqual([
        'git',
        ['update-index', '--assume-unchanged', '.npmrc']
      ])
      expect(mockExec.mock.calls[1][0]).toEqual('ssh-keyscan')
      expect(mockExec.mock.calls[2]).toEqual([
        'git',
        ['config', 'user.email', email]
      ])
      expect(mockExec.mock.calls[3]).toEqual([
        'git',
        ['config', 'user.name', username]
      ])
      expect(mockExec.mock.calls[4]).toEqual([
        'git',
        [
          'config',
          'core.sshCommand',
          expect.stringContaining('UserKnownHostsFile')
        ]
      ])
      expect(mockExec.mock.calls[5]).toEqual([
        'git',
        [
          'remote',
          'set-url',
          'origin',
          `git@github.com:${githubRepository}.git`
        ]
      ])
    })

    test('null ssh key', async () => {
      const repository = path.join(runnerTempDir as string, 'repo')
      await fs.mkdir(repository, {recursive: true})
      process.chdir(repository)
      await fs.writeFile('.npmrc', '')

      const email = 'user@example.com'
      const username = 'Example User'
      const deployKey = null
      const token = 'this is an npmrc file'

      await setupNpmPublish(email, username, deployKey, token, '.npmrc', true)

      const tokenData = await fs.readFile(path.join(repository, '.npmrc'))
      expect(tokenData.toString()).toEqual(`${token}
${UNSAFE_PERM}
`)

      const mockExec = mocked(exec)
      expect(mockExec.mock.calls.length).toEqual(1)

      expect(mockExec.mock.calls[0]).toEqual([
        'git',
        ['update-index', '--assume-unchanged', '.npmrc']
      ])
    })

    test('non-existing .npmrc file', async () => {
      const repository = path.join(runnerTempDir as string, 'repo')
      await fs.mkdir(repository, {recursive: true})
      process.chdir(repository)

      const email = 'user@example.com'
      const username = 'Example User'
      const deployKey = null
      const token = 'this is an npmrc file'

      await setupNpmPublish(email, username, deployKey, token, '.npmrc', false)

      const tokenData = await fs.readFile(path.join(repository, '.npmrc'))
      expect(tokenData.toString()).toEqual(`${token}
${UNSAFE_PERM}
`)

      const mockExec = mocked(exec)
      expect(mockExec.mock.calls.length).toEqual(0)
    })

    test('non-root npmrc', async () => {
      const repository = path.join(runnerTempDir as string, 'repo')
      const directory = `testdir`
      const npmrcPath = path.join(directory, `.npmrc`)
      await fs.mkdir(repository, {recursive: true})
      process.chdir(repository)
      await fs.mkdir(directory, {recursive: true})
      await fs.writeFile(npmrcPath, '')

      const email = 'user@example.com'
      const username = 'Example User'
      const deployKey = 'definitely an ssh key'
      const token = 'this is an npmrc file'

      await setupNpmPublish(email, username, deployKey, token, npmrcPath, true)

      const tokenData = await fs.readFile(path.join(repository, npmrcPath))
      expect(tokenData.toString()).toEqual(`${token}
${UNSAFE_PERM}
`)

      const sshKeyData = await fs.readFile(
        path.join(runnerTempDir as string, 'setup-npm-publish-action', 'id_rsa')
      )
      expect(sshKeyData.toString()).toEqual(`${deployKey}\n`)

      const mockExec = mocked(exec)
      expect(mockExec.mock.calls.length).toEqual(6)

      expect(mockExec.mock.calls[0]).toEqual([
        'git',
        ['update-index', '--assume-unchanged', npmrcPath]
      ])
      expect(mockExec.mock.calls[1][0]).toEqual('ssh-keyscan')
      expect(mockExec.mock.calls[2]).toEqual([
        'git',
        ['config', 'user.email', email]
      ])
      expect(mockExec.mock.calls[3]).toEqual([
        'git',
        ['config', 'user.name', username]
      ])
      expect(mockExec.mock.calls[4]).toEqual([
        'git',
        [
          'config',
          'core.sshCommand',
          expect.stringContaining('UserKnownHostsFile')
        ]
      ])
      expect(mockExec.mock.calls[5]).toEqual([
        'git',
        [
          'remote',
          'set-url',
          'origin',
          `git@github.com:${githubRepository}.git`
        ]
      ])
    })
  })

  describe('cleanupNpmPublish', () => {
    test('with git deploy key', async () => {
      const keyPath = path.join(
        runnerTempDir as string,
        'setup-npm-publish-action',
        'id_rsa'
      )
      const hostsPath = path.join(
        runnerTempDir as string,
        'setup-npm-publish-action',
        'known_hosts'
      )
      await cleanupNpmPublish('.npmrc', false)

      const mockGetState = mocked(getState)
      const mockExec = mocked(exec)

      expect(mockGetState.mock.calls.length).toEqual(1)
      expect(mockExec.mock.calls.length).toEqual(9)

      expect(mockExec.mock.calls[0]).toEqual(['shred', ['-zuf', keyPath]])
      expect(mockExec.mock.calls[1]).toEqual(['shred', ['-zuf', hostsPath]])
      expect(mockExec.mock.calls[2]).toEqual(['shred', ['-zf', '.npmrc']])
      expect(mockExec.mock.calls[3]).toEqual([
        'git',
        ['update-index', '--no-assume-unchanged', '.npmrc']
      ])
      expect(mockExec.mock.calls[4]).toEqual([
        'git',
        ['checkout', '--', '.npmrc']
      ])
      expect(mockExec.mock.calls[5]).toEqual([
        'git',
        ['config', '--unset', 'user.email']
      ])
      expect(mockExec.mock.calls[6]).toEqual([
        'git',
        ['config', '--unset', 'user.name']
      ])
      expect(mockExec.mock.calls[7]).toEqual([
        'git',
        ['config', '--unset', 'core.sshCommand']
      ])
      expect(mockExec.mock.calls[8]).toEqual([
        'git',
        [
          'remote',
          'set-url',
          'origin',
          `https://github.com/${githubRepository}`
        ]
      ])
    })

    test('without git deploy key', async () => {
      const mockGetState = mocked(getState)
      mockGetState.mockReturnValue('true')

      await cleanupNpmPublish('.npmrc', false)

      const mockExec = mocked(exec)

      expect(mockGetState.mock.calls.length).toEqual(1)
      expect(mockExec.mock.calls.length).toEqual(3)

      expect(mockExec.mock.calls[0]).toEqual(['shred', ['-zf', '.npmrc']])
      expect(mockExec.mock.calls[1]).toEqual([
        'git',
        ['update-index', '--no-assume-unchanged', '.npmrc']
      ])
      expect(mockExec.mock.calls[2]).toEqual([
        'git',
        ['checkout', '--', '.npmrc']
      ])
    })

    test('non-root npmrc', async () => {
      const mockGetState = mocked(getState)
      mockGetState.mockReturnValue('true')
      const npmrcPath = 'testdir/.npmrc'

      await cleanupNpmPublish(npmrcPath, false)

      const mockExec = mocked(exec)

      expect(mockGetState.mock.calls.length).toEqual(1)
      expect(mockExec.mock.calls.length).toEqual(3)

      expect(mockExec.mock.calls[0]).toEqual(['shred', ['-zf', npmrcPath]])
      expect(mockExec.mock.calls[1]).toEqual([
        'git',
        ['update-index', '--no-assume-unchanged', npmrcPath]
      ])
      expect(mockExec.mock.calls[2]).toEqual([
        'git',
        ['checkout', '--', npmrcPath]
      ])
    })

    test('without .npmrc', async () => {
      const mockGetState = mocked(getState)
      mockGetState.mockReturnValue('true')

      await cleanupNpmPublish('.npmrc', true)

      const mockExec = mocked(exec)

      expect(mockGetState.mock.calls.length).toEqual(1)
      expect(mockExec.mock.calls.length).toEqual(1)

      expect(mockExec.mock.calls[0]).toEqual(['shred', ['-zfu', '.npmrc']])
    })
  })
})
