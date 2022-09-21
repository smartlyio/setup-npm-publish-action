import * as core from '@actions/core'
import {cleanupNpmPublish, getEnv, setupNpmPublish} from './setup-npm-publish'

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
    const deployKey: string | null = getEnv('GIT_DEPLOY_KEY') || null
    const token: string | null = process.env['AUTH_TOKEN_STRING'] || null

    if (!post) {
      await setupNpmPublish(email, username, deployKey, token)
    } else {
      await cleanupNpmPublish()
    }
  } catch (error) {
    core.setFailed((error as Error).message)
  }
}

run()
