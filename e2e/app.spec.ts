import { expect, test } from '@playwright/test'

test('起動して「はじめに」を初期展開する', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'ようこそ、MdRWerへ' })).toBeVisible()
  const folder = page.getByRole('button', { name: /はじめに/ })
  await expect(folder).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('.favorite-folder > .folder-row')).toHaveAttribute('aria-expanded', 'false')
})

test('編集内容とタグを自動保存する', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: '編集する' }).click()
  await page.getByLabel('Markdown本文').fill('# E2Eノート\n\n本文 $E=mc^2$\n\n```mermaid\ngraph TD\n A-->B\n```')
  await page.getByLabel('タグ').fill('テスト, 数式')
  await page.getByLabel('タグ').press('Enter')
  await page.waitForTimeout(600)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'E2Eノート' })).toBeVisible()
  await expect(page.getByRole('main').getByText('#数式')).toBeVisible()
  await expect(page.locator('span.katex')).toBeVisible()
  await expect(page.locator('figure.mermaid-diagram')).toBeVisible()
})

test('その他メニューは外側をタップすると閉じる', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'その他の操作' }).click()
  await expect(page.locator('.action-menu')).toBeVisible()
  await page.locator('.paper').click({ position: { x: 10, y: 10 } })
  await expect(page.locator('.action-menu')).toBeHidden()
})

test('タッチ端末の一覧を左スワイプで閉じる', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'Desktop', 'タッチ端末だけで検証')
  await page.goto('./')
  const openButton = page.getByRole('button', { name: 'ノート一覧を開く' })
  if (await openButton.isVisible()) await openButton.click()
  const sidebar = page.locator('#note-sidebar')
  await expect(sidebar).toBeVisible()
  await sidebar.dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 270, clientY: 180, bubbles: true })
  await sidebar.dispatchEvent('pointermove', { pointerId: 1, pointerType: 'touch', clientX: 80, clientY: 184, bubbles: true })
  await sidebar.dispatchEvent('pointerup', { pointerId: 1, pointerType: 'touch', clientX: 80, clientY: 184, bubbles: true })
  await expect(sidebar).toBeHidden()
})

test('Service Workerキャッシュからオフライン起動する', async ({ page, context, browserName }) => {
  test.skip(browserName === 'webkit', 'Playwright WebKitはオフライン再読み込み時に内部エラーになるためChromium構成で検証')
  await page.goto('./')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await page.waitForLoadState('networkidle')
  await context.setOffline(true)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('main').getByRole('heading', { name: 'ようこそ、MdRWerへ' })).toBeVisible()
})
