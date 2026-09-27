/**
 * Browser end-to-end test.
 *
 * Drives a real Chromium against the running dev server, so it exercises the
 * same code path a person would: React render -> fetch -> FastAPI -> database.
 * It fails on ANY console error, page error or failed request, which is what
 * catches the class of bugs a build cannot (bad hooks, undefined access,
 * broken render).
 *
 *   node e2e/browser.test.mjs
 *   node e2e/browser.test.mjs --base-url http://localhost:5173 --headed
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SHOTS = resolve(HERE, '../screenshots')
mkdirSync(SHOTS, { recursive: true })

const args = process.argv.slice(2)
const BASE = valueOf('--base-url') || 'http://localhost:5173'
const HEADED = args.includes('--headed')
const EMAIL = 'user@test.com'
const PASSWORD = 'pass1234'

function valueOf(flag) {
  const index = args.indexOf(flag)
  return index === -1 ? null : args[index + 1]
}

const G = '\x1b[92m'
const R = '\x1b[91m'
const D = '\x1b[2m'
const B = '\x1b[1m'
const X = '\x1b[0m'

let passed = 0
const failures = []
const consoleErrors = []

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1
    console.log(`  ${G}PASS${X}  ${name}`)
  } else {
    failures.push([name, detail])
    console.log(`  ${R}FAIL${X}  ${name}  ${D}${detail}${X}`)
  }
  return condition
}

function section(title) {
  console.log(`\n${B}${title}${X}`)
}

const IGNORED_CONSOLE = [
  /Download the React DevTools/i,
  /favicon/i,
  /You are running React in development mode/i,
]

async function main() {
  const browser = await chromium.launch({ headless: !HEADED })
  const context = await browser.newContext({ viewport: { width: 1440, height: 940 } })
  const page = await context.newPage()

  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const text = message.text()
    if (IGNORED_CONSOLE.some((pattern) => pattern.test(text))) return
    consoleErrors.push(`[console] ${text}`)
  })
  page.on('pageerror', (error) => consoleErrors.push(`[pageerror] ${error.message}`))
  const watchResponse = (tag) => async (response) => {
    if (response.status() < 400) return
    const url = response.url()
    if (!url.includes('/api/')) return
    let body = ''
    try {
      body = (await response.text()).slice(0, 300)
    } catch {
      /* stream already consumed */
    }
    consoleErrors.push(`[${tag} ${response.status()}] ${response.request().method()} ${url} — ${body}`)
  }
  page.on('response', watchResponse('res'))
  page.on('requestfailed', (request) => {
    const failure = request.failure()?.errorText || ''
    if (failure.includes('ERR_ABORTED')) return
    consoleErrors.push(`[request] ${request.method()} ${request.url()} — ${failure}`)
  })

  const shot = async (name) => {
    await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false })
  }

  try {
    /* ------------------------------------------------------------ landing */
    section('Marketing site')
    await page.goto(BASE, { waitUntil: 'networkidle' })
    check('landing page renders the hero headline',
      await page.getByRole('heading', { name: /Track every skill/i }).isVisible())
    check('landing page shows the "Get started" CTA',
      await page.getByRole('link', { name: /Get started/i }).first().isVisible())
    check('landing page loads live platform stats from the API',
      (await page.getByText('Tracked skills').count()) > 0)
    check('landing page renders the community section',
      (await page.getByText('Trending this week').count()) > 0)
    await shot('01-landing')

    /* ---------------------------------------------------------- register */
    section('Registration + auto sign-in')
    const unique = Date.now().toString(36)
    const newEmail = `browser-${unique}@test.com`
    await page.goto(`${BASE}/register`, { waitUntil: 'networkidle' })
    check('register page renders', await page.getByRole('heading', { name: /Create your account/i }).isVisible())

    await page.fill('#name', 'Browser Tester')
    await page.fill('#username', `browser${unique}`.slice(0, 20))
    await page.fill('#email', newEmail)
    await page.fill('#password', 'BrowserTest123')
    await page.fill('#confirm', 'BrowserTest123')
    await page.fill('#first-skill', 'Browser Skill')
    await shot('02-register')
    await page.click('#register')

    await page.waitForURL(/\/app/, { timeout: 20000 })
    check('registration signs the user straight into the dashboard', page.url().includes('/app'))
    const greeted = await page
      .getByText(/Good (morning|afternoon|evening)|Burning the midnight|Winding down/i)
      .first()
      .waitFor({ state: 'visible', timeout: 20000 })
      .then(() => true)
      .catch(() => false)
    check('dashboard greets the new user', greeted)
    const chartUp = await page
      .getByText('Weekly practice trend')
      .first()
      .waitFor({ state: 'visible', timeout: 20000 })
      .then(() => true)
      .catch(() => false)
    check('dashboard renders for the new account', chartUp)

    /* ------------------------------------------------------------ skills */
    section('Create a skill')
    await page.goto(`${BASE}/app/skills`, { waitUntil: 'networkidle' })
    check('skills page lists the auto-created first skill',
      (await page.getByText('Browser Skill').count()) > 0)
    await page.click('#newSkill')
    await page.waitForSelector('#title', { timeout: 10000 })
    await page.fill('#title', 'End To End Guitar')
    await page.fill('#goalPerWeek', '240')
    await shot('03-create-skill')
    await page.click('#saveHobby')
    await page.waitForSelector('#title', { state: 'detached', timeout: 15000 })
    check('the new skill appears in the grid',
      (await page.getByText('End To End Guitar').count()) > 0)
    await shot('04-skills')

    /* ---------------------------------------------------------- practice */
    section('Log practice (Cypress-equivalent flow)')
    await page.goto(`${BASE}/app/practice`, { waitUntil: 'networkidle' })
    await page.click('#logPractice')
    await page.waitForSelector('#minutes', { timeout: 10000 })
    check('the log dialog exposes #minutes', await page.isVisible('#minutes'))
    check('the log dialog exposes #notes', await page.isVisible('#notes'))
    await page.fill('#minutes', '75')
    await page.fill('#notes', 'Browser end-to-end session. Scales, then the bridge.')
    await shot('05-log-practice')
    await page.click('#saveLog')
    await page.waitForSelector('#minutes', { state: 'detached', timeout: 15000 })
    check('the session is listed after saving',
      (await page.getByText('Browser end-to-end session').count()) > 0)
    check('a success toast confirms the streak',
      (await page.getByText(/Streak: 1 day/i).count()) > 0)
    await shot('06-practice')

    /* ------------------------------------------------------------- goals */
    section('Set a goal and watch progress move')
    await page.goto(`${BASE}/app/goals`, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: /Set a goal/i }).first().click()
    await page.waitForSelector('#goal-title', { timeout: 10000 })
    await page.fill('#goal-title', 'Reach 10 hours')
    await page.fill('#goal-target', '10')
    check('four milestones are previewed before saving',
      (await page.getByText(/quarter 4/i).count()) > 0)
    await shot('07-goal-form')
    await page.getByRole('button', { name: /Create goal/i }).click()
    await page.waitForSelector('#goal-title', { state: 'detached', timeout: 15000 })
    check('the goal card shows derived progress',
      (await page.getByText('Reach 10 hours').count()) > 0)
    const goalText = await page.getByText('Reach 10 hours').first().locator('xpath=ancestor::div[contains(@class,"card")]').innerText()
    check('75 logged minutes moved a 10-hour goal to 12.5%', /12\.5%/.test(goalText),
      goalText.replace(/\n/g, ' | ').slice(0, 200))
    await shot('08-goals')

    /* -------------------------------------------------------------- feed */
    section('Community feed')
    await page.goto(`${BASE}/app/feed`, { waitUntil: 'networkidle' })
    check('feed page renders the composer',
      await page.isVisible('#postText'))
    const postText = `Browser test post ${unique} — 75 minutes logged.`
    await page.fill('#postText', postText)
    await page.click('#submitPost')
    await page.waitForSelector(`text=${postText}`, { timeout: 15000 })
    check('the new post appears in the feed',
      (await page.getByText(postText).count()) > 0)
    await shot('09-feed')

    const likeButton = page.getByRole('button', { name: /🤍|❤️/ }).first()
    const before = await likeButton.innerText()
    await likeButton.click()
    await page.waitForTimeout(900)
    const after = await likeButton.innerText()
    check('liking a post updates the counter', before !== after, `${before} -> ${after}`)

    await page.getByPlaceholder('Add a comment…').first().fill('Nice work, keep it up!')
    await page.getByRole('button', { name: 'Post comment' }).first().click()
    await page.waitForSelector('text=Nice work, keep it up!', { timeout: 15000 })
    check('posting a comment renders the thread',
      (await page.getByText('Nice work, keep it up!').count()) > 0)
    await shot('10-feed-engaged')

    /* --------------------------------------------------------- analytics */
    section('Analytics + charts')
    await page.goto(`${BASE}/app/analytics`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1200)
    check('analytics renders the KPI row',
      (await page.getByText('Lifetime practice').count()) > 0)
    check('analytics renders the weekly trend chart',
      (await page.getByText('Weekly trend').count()) > 0)
    check('analytics renders the consistency heatmap',
      (await page.getByText('Consistency heatmap').count()) > 0)
    check('analytics renders at least one SVG chart',
      (await page.locator('svg').count()) > 10)
    await shot('11-analytics')

    /* --------------------------------------------------------- dashboard */
    section('Dashboard')
    await page.goto(`${BASE}/app`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1200)
    check('dashboard renders the streak hero',
      (await page.getByText(/You are on a/i).count()) > 0)
    check('dashboard shows the streak pattern the E2E suite asserts',
      /Streak: [1-9]/.test(await page.locator('body').innerText()))
    check('dashboard renders skill cards',
      (await page.getByText('End To End Guitar').count()) > 0)
    await shot('12-dashboard')

    /* ------------------------------------------------------ cloud console */
    section('Cloud console + object storage')
    await page.goto(`${BASE}/app/cloud`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(900)
    check('cloud console shows API health',
      (await page.getByText('API status').count()) > 0)
    check('cloud console lists the object storage bucket',
      (await page.getByText('Object storage bucket').count()) > 0)
    check('cloud console renders the architecture layers',
      (await page.getByText('Architecture layers').count()) > 0)
    await shot('13-cloud-console')

    /* ------------------------------------------------------------- other */
    section('Remaining routes render')
    for (const [path, needle] of [
      ['/app/discover', 'Discover skills'],
      ['/app/leaderboard', 'leaderboard'],
      ['/app/settings', 'Settings'],
      ['/app/skills', 'My skills'],
    ]) {
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
      await page.waitForTimeout(700)
      const body = (await page.locator('body').innerText()).toLowerCase()
      check(`${path} renders`, body.includes(needle.toLowerCase()), `missing "${needle}"`)
    }
    await page.goto(`${BASE}/app/discover`, { waitUntil: 'networkidle' })
    await shot('14-discover')
    await page.goto(`${BASE}/app/leaderboard`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(700)
    await shot('15-leaderboard')
    await page.goto(`${BASE}/app/settings`, { waitUntil: 'networkidle' })
    await shot('16-settings')

    /* ---------------------------------------------------- demo account UI */
    section('Demo account (user@test.com)')
    const demoContext = await browser.newContext({ viewport: { width: 1440, height: 940 } })
    const demoPage = await demoContext.newPage()
    demoPage.on('pageerror', (error) => consoleErrors.push(`[demo pageerror] ${error.message}`))
    demoPage.on('response', watchResponse('demo'))
    await demoPage.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
    check('login page exposes #email, #password and #login',
      (await demoPage.isVisible('#email')) &&
        (await demoPage.isVisible('#password')) &&
        (await demoPage.isVisible('#login')))
    await demoPage.fill('#email', EMAIL)
    await demoPage.fill('#password', PASSWORD)
    await demoPage.screenshot({ path: `${SHOTS}/17-login.png` })
    await demoPage.click('#login')
    await demoPage.waitForURL(/\/app/, { timeout: 20000 })
    await demoPage.waitForFunction(() => /Streak: [1-9]/.test(document.body.innerText), null, { timeout: 25000 })
    const demoBody = await demoPage.locator('body').innerText()
    check('the seeded demo account has a rich dashboard',
      /Aarav/.test(demoBody) && /Streak: [1-9]/.test(demoBody),
      demoBody.slice(0, 160).replace(/\n/g, ' | '))
    check('the demo account shows multiple seeded skills',
      (await demoPage.getByText('Guitar').count()) > 0)
    await demoPage.screenshot({ path: `${SHOTS}/18-demo-dashboard.png` })

    await demoPage.goto(`${BASE}/app/feed`, { waitUntil: 'networkidle' })
    await demoPage.waitForTimeout(1200)
    check('the seeded feed is populated for the demo account',
      (await demoPage.locator('article, [class*="card"]').count()) > 3)
    await demoPage.screenshot({ path: `${SHOTS}/19-demo-feed.png` })

    await demoPage.goto(`${BASE}/u/demo`, { waitUntil: 'networkidle' })
    await demoPage.waitForTimeout(1200)
    check('the public profile page renders',
      (await demoPage.getByText('@demo').count()) > 0)
    check('the public profile never shows an e-mail address',
      !/demo@test|@test\.com/.test(await demoPage.locator('body').innerText()))
    await demoPage.screenshot({ path: `${SHOTS}/20-public-profile.png` })

    await demoContext.close()

    /* -------------------------------------------------- persistence test */
    section('Cross-device session (the "any device" claim)')
    const secondContext = await browser.newContext()
    const secondPage = await secondContext.newPage()
    await secondPage.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
    await secondPage.fill('#email', EMAIL)
    await secondPage.fill('#password', PASSWORD)
    await secondPage.click('#login')
    await secondPage.waitForURL(/\/app/, { timeout: 20000 })
    check('the same account can sign in from a second browser context',
      secondPage.url().includes('/app'))
    await secondContext.close()

    /* -------------------------------------------------------- light mode */
    section('Theme toggle')
    await page.goto(`${BASE}/app`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(900)
    await page.getByRole('button', { name: /Light mode/i }).click()
    await page.waitForTimeout(700)
    check('light mode applies the light class to <html>',
      await page.locator('html.light').count() === 1)
    await shot('21-light-mode')
    await page.getByRole('button', { name: /Dark mode/i }).click()
    await page.waitForTimeout(500)

    /* ------------------------------------------------------- responsive */
    section('Responsive layout')
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`${BASE}/app`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(900)
    check('mobile viewport renders without horizontal overflow',
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2),
      await page.evaluate(() => `${document.documentElement.scrollWidth} vs ${window.innerWidth}`))
    await shot('22-mobile-dashboard')
    await page.setViewportSize({ width: 1440, height: 940 })
  } catch (error) {
    failures.push(['fatal', error.message])
    console.log(`\n${R}FATAL${X} ${error.message}`)
    try {
      await page.screenshot({ path: `${SHOTS}/99-failure.png` })
    } catch {
      /* ignore */
    }
  } finally {
    await browser.close()
  }

  section('Console / network health')
  check('no console errors, page errors or failed requests', consoleErrors.length === 0,
    consoleErrors.slice(0, 12).join(' || '))

  console.log(`\n${B}${'='.repeat(62)}${X}`)
  console.log(`${B}Total:${X} ${passed + failures.length}   ${G}passed: ${passed}${X}   ${
    failures.length ? R : G
  }failed: ${failures.length}${X}`)
  if (failures.length) {
    console.log(`\n${R}${B}Failures:${X}`)
    failures.forEach(([name, detail]) => console.log(`  - ${name}  ${D}${detail}${X}`))
  }
  console.log(`${B}${'='.repeat(62)}${X}`)
  console.log(`${D}Screenshots written to ${SHOTS}${X}`)
  process.exit(failures.length ? 1 : 0)
}

main()
