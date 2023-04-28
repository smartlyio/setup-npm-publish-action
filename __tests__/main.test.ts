// import {core} from '@actions/core';
import {getState, warning} from '@actions/core'
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
  updateNpmrc
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

const {exec: actualExec} = jest.requireActual('@actions/exec')

function escapeRegExp(item: string) {
  return item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function matchNpmrcOptions(
  values: Record<string, string>,
  npmrcContent: string
): void {
  for (const key in values) {
    const value = values[key]
    expect(npmrcContent.toString()).toMatch(
      new RegExp(`^${escapeRegExp(key)}\\s*=\\s*${escapeRegExp(value)}$`, 'm')
    )
  }
}

function negativeMatchNpmrcOptions(
  values: Record<string, string>,
  npmrcContent: string
): void {
  for (const key in values) {
    const value = values[key]
    expect(npmrcContent.toString()).not.toMatch(
      new RegExp(`^${escapeRegExp(key)}\\s*=\\s*${escapeRegExp(value)}$`, 'm')
    )
  }
}

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

  describe('git configutation', () => {
    test('get ssh path', () => {
      const filePath = getSshPath('id_rsa')
      expect(filePath).toEqual(
        `${runnerTempDir}/setup-npm-publish-action/id_rsa`
      )
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
  })

  describe('update npmrc', () => {
    test('Updates multiline npmrc without comments', async () => {
      const repository = path.join(runnerTempDir as string, 'repo')
      const npmrcPath = path.join(repository, '.npmrc')
      await fs.mkdir(repository, {recursive: true})
      process.chdir(repository)
      await fs.writeFile(npmrcPath, '')
      await fs.writeFile('package.json', '{}')

      const newNpmrcContent = `
registry = https://artifactor.ee/registry
# test comment
  # another comment = something
email = test@example.com # more comments
`

      const mockExec = mocked(exec)
      mockExec.mockImplementation(async (cmd, args, options) => {
        return await actualExec(cmd, args, options)
      })

      await updateNpmrc(npmrcPath, newNpmrcContent)

      const npmrcContent = (await fs.readFile(npmrcPath)).toString()
      const options: Record<string, string> = {
        registry: 'https://artifactor.ee/registry',
        email: 'test@example.com'
      }

      matchNpmrcOptions(options, npmrcContent)

      expect(npmrcContent.toString()).not.toMatch(
        new RegExp(`test comment`, 'm')
      )
      expect(npmrcContent.toString()).not.toMatch(
        new RegExp(`another comment`, 'm')
      )
      expect(npmrcContent.toString()).not.toMatch(
        new RegExp(`more comments`, 'm')
      )
    })

    test('Updates npmrc with npm config set in empty file', async () => {
      const repository = path.join(runnerTempDir as string, 'repo')
      const npmrcPath = path.join(repository, '.npmrc')
      await fs.mkdir(repository, {recursive: true})
      process.chdir(repository)
      await fs.writeFile(npmrcPath, '')
      await fs.writeFile('package.json', '{}')

      const mockExec = mocked(exec)
      mockExec.mockImplementation(async (cmd, args, options) => {
        return await actualExec(cmd, args, options)
      })

      await updateNpmrc(npmrcPath, 'registry = https://artifactor.ee/registry')

      const npmrcContent = (await fs.readFile(npmrcPath)).toString()
      const options: Record<string, string> = {
        registry: 'https://artifactor.ee/registry'
      }

      matchNpmrcOptions(options, npmrcContent)
    })

    test('Updates npmrc with npm config set in new file', async () => {
      const repository = path.join(runnerTempDir as string, 'repo')
      const npmrcPath = path.join(repository, '.npmrc')
      await fs.mkdir(repository, {recursive: true})
      process.chdir(repository)
      await fs.writeFile('package.json', '{}')

      const mockExec = mocked(exec)
      mockExec.mockImplementation(async (cmd, args, options) => {
        return await actualExec(cmd, args, options)
      })

      await updateNpmrc(npmrcPath, 'registry = https://artifactor.ee/registry')

      const npmrcContent = (await fs.readFile(npmrcPath)).toString()
      const options: Record<string, string> = {
        registry: 'https://artifactor.ee/registry'
      }

      matchNpmrcOptions(options, npmrcContent)
    })

    test('Updates npmrc with npm config set with existing content', async () => {
      const repository = path.join(runnerTempDir as string, 'repo')
      const npmrcPath = path.join(repository, '.npmrc')
      await fs.mkdir(repository, {recursive: true})
      process.chdir(repository)
      await fs.writeFile(npmrcPath, 'registry = https://artifactor.ee/registry')
      await fs.writeFile('package.json', '{}')

      const mockExec = mocked(exec)
      mockExec.mockImplementation(async (cmd, args, options) => {
        return await actualExec(cmd, args, options)
      })

      await updateNpmrc(npmrcPath, 'registry = https://artifactor.ee/registry')

      const npmrcContent = (await fs.readFile(npmrcPath)).toString()
      const options: Record<string, string> = {
        registry: 'https://artifactor.ee/registry'
      }

      matchNpmrcOptions(options, npmrcContent)
    })

    test('Manually adds always-auth', async () => {
      const repository = path.join(runnerTempDir as string, 'repo')
      const npmrcPath = path.join(repository, '.npmrc')
      await fs.mkdir(repository, {recursive: true})
      process.chdir(repository)
      await fs.writeFile(npmrcPath, '')
      await fs.writeFile('package.json', '{}')

      const mockExec = mocked(exec)
      mockExec.mockImplementation(async (cmd, args, options) => {
        return await actualExec(cmd, args, options)
      })

      await updateNpmrc(
        npmrcPath,
        'always-auth=true\n//repo/:always-auth=true\n'
      )

      expect(mockExec.mock.calls.length).toEqual(0)

      const mockWarning = mocked(warning)
      expect(mockWarning.mock.calls.length).toEqual(2)

      expect(mockWarning.mock.calls[0]).toEqual([
        'always-auth is not supported by npm config set; writing it manually to the file'
      ])
      expect(mockWarning.mock.calls[1]).toEqual([
        'always-auth is not supported by npm config set; writing it manually to the file'
      ])

      const npmrcContent = (await fs.readFile(npmrcPath)).toString()
      const options: Record<string, string> = {
        'always-auth': 'true',
        '//repo/:always-auth': 'true'
      }

      matchNpmrcOptions(options, npmrcContent)
    })
  })

  describe('setupNpmPublish', () => {
    test('non-null token', async () => {
      const repository = path.join(runnerTempDir as string, 'repo')
      await fs.mkdir(repository, {recursive: true})
      process.chdir(repository)
      await fs.writeFile('.npmrc', '')
      await fs.writeFile('package.json', '{}')

      const email = 'user@example.com'
      const username = 'Example User'
      const deployKey = 'definitely an ssh key'
      const newNpmrc = 'registry = https://artifactor.ee/registry'

      await setupNpmPublish(
        email,
        username,
        deployKey,
        newNpmrc,
        '.npmrc',
        true
      )

      const sshKeyData = await fs.readFile(
        path.join(runnerTempDir as string, 'setup-npm-publish-action', 'id_rsa')
      )
      expect(sshKeyData.toString()).toEqual(`${deployKey}\n`)

      const mockExec = mocked(exec)
      expect(mockExec.mock.calls.length).toEqual(7)

      expect(mockExec.mock.calls[0]).toEqual([
        'npm',
        [
          'config',
          'set',
          '--location',
          'project',
          'registry',
          'https://artifactor.ee/registry'
        ],
        expect.objectContaining({cwd: repository})
      ])
      expect(mockExec.mock.calls[1]).toEqual([
        'git',
        ['update-index', '--assume-unchanged', '.npmrc']
      ])
      expect(mockExec.mock.calls[2][0]).toEqual('ssh-keyscan')
      expect(mockExec.mock.calls[3]).toEqual([
        'git',
        ['config', 'user.email', email]
      ])
      expect(mockExec.mock.calls[4]).toEqual([
        'git',
        ['config', 'user.name', username]
      ])
      expect(mockExec.mock.calls[5]).toEqual([
        'git',
        [
          'config',
          'core.sshCommand',
          expect.stringContaining('UserKnownHostsFile')
        ]
      ])
      expect(mockExec.mock.calls[6]).toEqual([
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
      const newNpmrc = null

      await setupNpmPublish(
        email,
        username,
        deployKey,
        newNpmrc,
        '.npmrc',
        true
      )

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
      const newNpmrc = 'registry = https://artifactor.ee/registry'

      await setupNpmPublish(
        email,
        username,
        deployKey,
        newNpmrc,
        '.npmrc',
        true
      )

      const mockExec = mocked(exec)
      expect(mockExec.mock.calls.length).toEqual(2)

      expect(mockExec.mock.calls[0]).toEqual([
        'npm',
        [
          'config',
          'set',
          '--location',
          'project',
          'registry',
          'https://artifactor.ee/registry'
        ],
        expect.objectContaining({cwd: repository})
      ])
      expect(mockExec.mock.calls[1]).toEqual([
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
      const newNpmrc = 'email = somename@example.com'

      await setupNpmPublish(
        email,
        username,
        deployKey,
        newNpmrc,
        '.npmrc',
        false
      )

      const mockExec = mocked(exec)
      expect(mockExec.mock.calls.length).toEqual(1)
      expect(mockExec.mock.calls[0]).toEqual([
        'npm',
        [
          'config',
          'set',
          '--location',
          'project',
          'email',
          'somename@example.com'
        ],
        expect.objectContaining({cwd: repository})
      ])
    })

    test('non-root npmrc', async () => {
      const repository = path.join(runnerTempDir as string, 'repo')
      const directory = `testdir`
      const npmrcPath = path.join(directory, `.npmrc`)
      const npmrcDirectory = path.resolve(path.join(repository, directory))
      await fs.mkdir(repository, {recursive: true})
      process.chdir(repository)
      await fs.mkdir(directory, {recursive: true})
      await fs.writeFile(npmrcPath, '')

      const email = 'user@example.com'
      const username = 'Example User'
      const deployKey = 'definitely an ssh key'
      const newNpmrc = 'registry = https://artifactor.ee/registry'

      await setupNpmPublish(
        email,
        username,
        deployKey,
        newNpmrc,
        npmrcPath,
        true
      )

      const sshKeyData = await fs.readFile(
        path.join(runnerTempDir as string, 'setup-npm-publish-action', 'id_rsa')
      )
      expect(sshKeyData.toString()).toEqual(`${deployKey}\n`)

      const mockExec = mocked(exec)
      expect(mockExec.mock.calls.length).toEqual(7)

      expect(mockExec.mock.calls[0]).toEqual([
        'npm',
        [
          'config',
          'set',
          '--location',
          'project',
          'registry',
          'https://artifactor.ee/registry'
        ],
        expect.objectContaining({cwd: npmrcDirectory})
      ])
      expect(mockExec.mock.calls[1]).toEqual([
        'git',
        ['update-index', '--assume-unchanged', npmrcPath]
      ])
      expect(mockExec.mock.calls[2][0]).toEqual('ssh-keyscan')
      expect(mockExec.mock.calls[3]).toEqual([
        'git',
        ['config', 'user.email', email]
      ])
      expect(mockExec.mock.calls[4]).toEqual([
        'git',
        ['config', 'user.name', username]
      ])
      expect(mockExec.mock.calls[5]).toEqual([
        'git',
        [
          'config',
          'core.sshCommand',
          expect.stringContaining('UserKnownHostsFile')
        ]
      ])
      expect(mockExec.mock.calls[6]).toEqual([
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
      expect(mockExec.mock.calls.length).toEqual(10)

      expect(mockExec.mock.calls[0]).toEqual(['shred', ['-zuf', keyPath]])
      expect(mockExec.mock.calls[1]).toEqual(['shred', ['-zuf', hostsPath]])
      expect(mockExec.mock.calls[2]).toEqual([
        'git',
        ['rev-parse', '--is-inside-work-tree']
      ])
      expect(mockExec.mock.calls[3]).toEqual(['shred', ['-zf', '.npmrc']])
      expect(mockExec.mock.calls[4]).toEqual([
        'git',
        ['update-index', '--no-assume-unchanged', '.npmrc']
      ])
      expect(mockExec.mock.calls[5]).toEqual([
        'git',
        ['checkout', '--', '.npmrc']
      ])
      expect(mockExec.mock.calls[6]).toEqual([
        'git',
        ['config', '--unset', 'user.email']
      ])
      expect(mockExec.mock.calls[7]).toEqual([
        'git',
        ['config', '--unset', 'user.name']
      ])
      expect(mockExec.mock.calls[8]).toEqual([
        'git',
        ['config', '--unset', 'core.sshCommand']
      ])
      expect(mockExec.mock.calls[9]).toEqual([
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
      expect(mockExec.mock.calls.length).toEqual(4)

      expect(mockExec.mock.calls[0]).toEqual([
        'git',
        ['rev-parse', '--is-inside-work-tree']
      ])
      expect(mockExec.mock.calls[1]).toEqual(['shred', ['-zf', '.npmrc']])
      expect(mockExec.mock.calls[2]).toEqual([
        'git',
        ['update-index', '--no-assume-unchanged', '.npmrc']
      ])
      expect(mockExec.mock.calls[3]).toEqual([
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
      expect(mockExec.mock.calls.length).toEqual(4)

      expect(mockExec.mock.calls[0]).toEqual([
        'git',
        ['rev-parse', '--is-inside-work-tree']
      ])
      expect(mockExec.mock.calls[1]).toEqual(['shred', ['-zf', npmrcPath]])
      expect(mockExec.mock.calls[2]).toEqual([
        'git',
        ['update-index', '--no-assume-unchanged', npmrcPath]
      ])
      expect(mockExec.mock.calls[3]).toEqual([
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
      expect(mockExec.mock.calls.length).toEqual(2)

      expect(mockExec.mock.calls[0]).toEqual([
        'git',
        ['rev-parse', '--is-inside-work-tree']
      ])
      expect(mockExec.mock.calls[1]).toEqual(['shred', ['-zfu', '.npmrc']])
    })
  })
})
