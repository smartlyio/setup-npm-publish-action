// import {core} from '@actions/core';
import {exec} from '@actions/exec'
import {promises as fs} from 'fs'
import * as fssync from 'fs'
import * as path from 'path'
import {mocked} from 'ts-jest/utils'

import {
  UNSAFE_PERM,
  getEnv,
  getSshPath,
  sshKeyscan,
  setupNpmPublish,
  cleanupNpmPublish
} from '../src/setup-npm-publish'

jest.mock('@actions/core', () => ({
  info: jest.fn(),
  warning: jest.fn()
}))

jest.mock('@actions/exec', () => ({
  exec: jest.fn()
}))

let homeTmpDir: string | null = null
const originalDirectory = process.cwd()
const githubRepository = 'smartlyio/setup-npm-publish-action'
const OLD_ENV = process.env
beforeEach(() => {
  jest.resetAllMocks()
  homeTmpDir = fssync.mkdtempSync(path.join(originalDirectory, 'temp-home'))
  process.chdir(homeTmpDir)
  process.env = {...OLD_ENV}
  process.env['HOME'] = homeTmpDir
  process.env['GITHUB_REPOSITORY'] = githubRepository
})

afterEach(() => {
  process.chdir(originalDirectory)
  process.env = OLD_ENV
  fssync.rmdirSync(homeTmpDir as string, {recursive: true})
  homeTmpDir = null
})

describe('test npm-setup-publish', () => {
  describe('get env', () => {
    test('failure', () => {
      delete process.env['HOME']
      expect(() => {
        getEnv('HOME')
      }).toThrow()
    })

    test('gets env var', () => {
      expect(getEnv('HOME')).toEqual(homeTmpDir)
    })
  })

  test('get ssh path', () => {
    const filePath = getSshPath('id_rsa')
    expect(filePath).toEqual(`${homeTmpDir}/.ssh/id_rsa`)
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
      const repository = path.join(homeTmpDir as string, 'repo')
      await fs.mkdir(repository, {recursive: true})
      process.chdir(repository)

      const email = 'user@example.com'
      const username = 'Example User'
      const deployKey = 'definitely an ssh key'
      const token = 'this is an npmrc file'

      await setupNpmPublish(email, username, deployKey, token)

      const tokenData = await fs.readFile(path.join(repository, '.npmrc'))
      expect(tokenData.toString()).toEqual(`${token}
${UNSAFE_PERM}
`)

      const sshKeyData = await fs.readFile(
        path.join(homeTmpDir as string, '.ssh', 'id_rsa')
      )
      expect(sshKeyData.toString()).toEqual(deployKey)

      const mockExec = mocked(exec)
      expect(mockExec.mock.calls.length).toEqual(6)

      expect(mockExec.mock.calls[0][0]).toEqual('ssh-keyscan')
      expect(mockExec.mock.calls[1]).toEqual([
        'git',
        ['update-index', '--assume-unchanged', '.npmrc']
      ])
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
      const repository = path.join(homeTmpDir as string, 'repo')
      await fs.mkdir(repository, {recursive: true})
      process.chdir(repository)

      const email = 'user@example.com'
      const username = 'Example User'
      const deployKey = 'definitely an ssh key'
      const token = null

      await setupNpmPublish(email, username, deployKey, token)

      const tokenData = await fs.readFile(path.join(repository, '.npmrc'))
      expect(tokenData.toString()).toEqual(`
${UNSAFE_PERM}
`)

      const sshKeyData = await fs.readFile(
        path.join(homeTmpDir as string, '.ssh', 'id_rsa')
      )
      expect(sshKeyData.toString()).toEqual(deployKey)

      const mockExec = mocked(exec)
      expect(mockExec.mock.calls.length).toEqual(6)

      expect(mockExec.mock.calls[0][0]).toEqual('ssh-keyscan')
      expect(mockExec.mock.calls[1]).toEqual([
        'git',
        ['update-index', '--assume-unchanged', '.npmrc']
      ])
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

  test('cleanupNpmPublish', async () => {
    const keyPath = path.join(homeTmpDir as string, '.ssh', 'id_rsa')
    const hostsPath = path.join(homeTmpDir as string, '.ssh', 'known_hosts')
    await cleanupNpmPublish()

    const mockExec = mocked(exec)
    expect(mockExec.mock.calls.length).toEqual(9)

    expect(mockExec.mock.calls[0]).toEqual(['shred', ['-zuf', keyPath]])
    expect(mockExec.mock.calls[1]).toEqual(['shred', ['-zuf', hostsPath]])
    expect(mockExec.mock.calls[2]).toEqual(['shred', ['-zf', '.npmrc']])
    expect(mockExec.mock.calls[3]).toEqual([
      'git',
      ['update-index', '--no-assume-unchanged', '.npmrc']
    ])
    expect(mockExec.mock.calls[4]).toEqual(['git', ['checkout', '.npmrc']])
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
      ['remote', 'set-url', 'origin', `https://github.com/${githubRepository}`]
    ])
  })
})
