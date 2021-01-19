// import {core} from '@actions/core';
// import {exec} from '@actions/exec';
import {promises as fs} from 'fs'
import * as fssync from 'fs'
import * as path from 'path'

import {
  getEnv,
  getSshPath
  // sshKeyscan,
  // setupNpmPublish,
  // cleanupNpmPublish
} from '../src/setup-npm-publish'

jest.mock('@actions/core', () => ({
  info: jest.fn(),
  warning: jest.fn()
}));

jest.mock('@actions/exec', () => ({
  exec: jest.fn()
}));

let homeTmpDir: string | null = null
const OLD_ENV = process.env
beforeEach(() => {
  homeTmpDir = fssync.mkdtempSync('temp-home')
  process.env = {...OLD_ENV}
  process.env['HOME'] = homeTmpDir
})

afterEach(() => {
  process.env = OLD_ENV
  fssync.rmdirSync(homeTmpDir as string, {recursive: true})
  homeTmpDir = null
})


describe('test npm-setup-publish', () => {
  describe('get env', () => {
    test('failure', () => {
      delete process.env['HOME']
      expect(() => { getEnv('HOME') }).toThrow()
    })

    test('gets env var', () => {
      expect(getEnv('HOME')).toEqual(homeTmpDir)
    })
  })

  test('get ssh path', () => {
    const filePath = getSshPath('id_rsa')
    expect(filePath).toEqual(`${homeTmpDir}/.ssh/id_rsa`)
  })
})
