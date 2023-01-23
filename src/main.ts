import * as core from '@actions/core'
import {cleanupNpmPublish, setupNpmPublish} from './setup-npm-publish'
import {constants, promises as fs} from 'fs'

function isPost(): boolean {
  // Will be false if the environment variable doesn't exist; true if it does.
  return !!process.env['STATE_isPost']
}

async function run(): Promise<void> {
  try {
    const post = isPost()
    core.saveState('isPost', post)
    const email: string = core.getInput('email')
    const username: string = core.getInput('username')
    const deployKey: string | null = process.env['GIT_DEPLOY_KEY'] || null
    const token: string | null = process.env['AUTH_TOKEN_STRING'] || null

    if (!post) {
      let npmrcExists = false
      try {
        await fs.access('.npmrc', constants.F_OK)
        npmrcExists = true
      } catch {
        /* NOOP */
      }

      await setupNpmPublish(email, username, deployKey, token, npmrcExists)
    } else {
      let npmrcInGitExcluded = false
      try {
        await fs.access('.git/info/exclude', constants.F_OK)
        npmrcInGitExcluded =
          (await fs.readFile('.git/info/exclude', 'utf-8')).match(
            /^\.npmrc$/m
          ) != null
      } catch {
        /* NOOP */
      }

      await cleanupNpmPublish(npmrcInGitExcluded)
    }
  } catch (error) {
    core.setFailed((error as Error).message)
  }
}

run()
