import { expect, test, type Page } from '@playwright/test';

/** 填一个最简单的两幕故事 */
async function fillSimpleStory(page: Page) {
  await page.locator('[data-testid="text-0-0"]').fill('小猫醒来了');
  await page.locator('[data-testid="text-1-0"]').fill('小猫睡着了');
}

test.describe('录入验收', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./');
  });

  test('页面标题与基础控件可见', async ({ page }) => {
    await expect(page).toHaveTitle(/抽拉故事卡/);
    await expect(page.getByRole('heading', { name: /纸套排版小工具/ })).toBeVisible();
    await expect(page.locator('[data-testid="solve-btn"]')).toBeVisible();
    // 默认两幕各一张牌
    await expect(page.locator('[data-testid="text-0-0"]')).toBeVisible();
    await expect(page.locator('[data-testid="text-1-0"]')).toBeVisible();
  });

  test('可以加幕、加牌、删牌、删幕', async ({ page }) => {
    await page.locator('[data-testid="add-act"]').click();
    await expect(page.locator('fieldset.act')).toHaveCount(3);
    await page.locator('[data-testid="add-card-0"]').click();
    await expect(page.locator('[data-testid="text-0-1"]')).toBeVisible();
    // 删掉第二张牌（第 0 幕每行有个 × 按钮）
    const cardRows = page.locator('fieldset.act').first().locator('.card-row');
    await cardRows.nth(1).locator('button.mini').click();
    await expect(page.locator('[data-testid="text-0-1"]')).toHaveCount(0);
    // 删回两幕
    await page.locator('button.mini.danger').first().click();
    await expect(page.locator('fieldset.act')).toHaveCount(2);
  });

  test('能为牌切换允许窗口，窗口数量可改', async ({ page }) => {
    await page.locator('input[name="windowCount"][value="2"]').check({ force: true });
    const check0 = page.locator('[data-testid="allow-0-0-1"]');
    await check0.check();
    await expect(check0).toBeChecked();
    await check0.uncheck();
    await expect(check0).not.toBeChecked();
  });

  test('空句子点求解：出现适龄温和提示，不是技术报错', async ({ page }) => {
    await page.locator('[data-testid="solve-btn"]').click();
    const err = page.locator('.err').first();
    await expect(err).toBeVisible();
    await expect(err).toContainText(/还没有写句子/);
    const body = await page.locator('body').innerText();
    expect(body).not.toMatch(/TypeError|undefined is not|Uncaught|stack trace/);
  });
});

test.describe('校样验收', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./');
  });

  test('录入有解故事 → 出现成功校样与 SVG 联动图', async ({ page }) => {
    await fillSimpleStory(page);
    await page.locator('[data-testid="solve-btn"]').click();
    await expect(page.locator('[data-testid="proof-ok"]')).toBeVisible();
    await expect(page.locator('[data-testid="scene"] svg')).toBeVisible();
    // 成功横幅说明列数与停点
    await expect(page.locator('.banner.ok')).toContainText(/排好啦/);
    // 两张牌槽位不重合的明细表
    await expect(page.locator('.plan-table')).toHaveCount(2);
  });

  test('无解故事 → 最短不可行前缀取证，含窗口/停点/槽位', async ({ page }) => {
    // 三张牌挤一个窗口：同幕必撞槽，无解
    await page.locator('[data-testid="add-card-0"]').click();
    await page.locator('[data-testid="text-0-0"]').fill('第一句');
    await page.locator('[data-testid="text-0-1"]').fill('第二句');
    await page.locator('[data-testid="text-1-0"]').fill('第三句');
    await page.locator('[data-testid="solve-btn"]').click();
    await expect(page.locator('[data-testid="proof-bad"]')).toBeVisible();
    await expect(page.locator('.banner.bad')).toContainText(/怎么摆都不行/);
    // 取证：至少一条 trouble，说明窗口/槽
    const trouble = page.locator('[data-testid^="trouble-"]').first();
    await expect(trouble).toContainText(/窗/);
    await expect(trouble).toContainText(/槽/);
  });

  test('改输入立即清掉旧校样', async ({ page }) => {
    await fillSimpleStory(page);
    await page.locator('[data-testid="solve-btn"]').click();
    await expect(page.locator('[data-testid="proof-ok"]')).toBeVisible();
    // 改一个字
    await page.locator('[data-testid="text-0-0"]').fill('改句子啦');
    await expect(page.locator('[data-testid="proof-ok"]')).toHaveCount(0);
    await expect(page.locator('.howto')).toBeVisible();
  });

  test('拖动停点：制造冲突时出现红色警示', async ({ page }) => {
    // 两窗两幕：让每幕两张牌允许两窗。最优解第二幕停点 >1，
    // 用键盘把它一路向左移到必露底的位置，红色警示应出现。
    await page.locator('input[name="windowCount"][value="2"]').check({ force: true });
    await page.locator('[data-testid="add-card-0"]').click();
    await page.locator('[data-testid="add-card-1"]').click();
    for (const id of ['allow-0-0-1', 'allow-0-1-1', 'allow-1-0-1', 'allow-1-1-1']) {
      await page.locator(`[data-testid="${id}"]`).check();
    }
    await page.locator('[data-testid="text-0-0"]').fill('甲');
    await page.locator('[data-testid="text-0-1"]').fill('乙');
    await page.locator('[data-testid="text-1-0"]').fill('丙');
    await page.locator('[data-testid="text-1-1"]').fill('丁');
    await page.locator('[data-testid="solve-btn"]').click();
    await expect(page.locator('[data-testid="proof-ok"]')).toBeVisible();

    const handle = page.locator('circle.stop-handle.draggable').first();
    await handle.focus();

    // 右移到与窗口跨度（2 列）重合的位置，会立刻露底
    let warningShown = false;
    for (let i = 0; i < 11; i++) {
      await page.keyboard.press('ArrowRight');
      if (await page.locator('[data-testid="trial-warning"]').isVisible()) {
        warningShown = true;
        break;
      }
    }
    await expect(page.locator('[data-testid="scene"] svg')).toBeVisible();
    expect(warningShown).toBe(true);
  });

  test('“回去改句子”可返回编辑，校样消失', async ({ page }) => {
    await fillSimpleStory(page);
    await page.locator('[data-testid="solve-btn"]').click();
    await page.locator('.actions .secondary').first().click();
    await expect(page.locator('[data-testid="proof-ok"]')).toHaveCount(0);
  });
});

test.describe('打印验收', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./');
  });

  test('点打印生成含裁切线、粘贴区、停点刻线内容的离帧（无网络请求）', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (req) => {
      if (req.resourceType() === 'document' || req.resourceType() === 'xhr' ||
        req.resourceType() === 'fetch') {
        requests.push(req.url());
      }
    });

    await fillSimpleStory(page);
    await page.locator('[data-testid="solve-btn"]').click();
    await page.locator('[data-testid="print-btn"]').click();

    const frame = page.frameLocator('iframe[data-testid="print-frame"]');
    await expect(frame.locator('.sleeve-cut')).toBeVisible();
    await expect(frame.locator('.flap')).toHaveCount(2);
    await expect(frame.locator('.stop-line')).not.toHaveCount(0);
    await expect(frame.locator('.window-cut')).not.toHaveCount(0);
    await expect(frame.locator('.printed-card')).not.toHaveCount(0);

    // 打印帧不得产生对外部服务的请求
    const external = requests.filter((u) =>
      !u.startsWith('http://127.0.0.1:4173') && !u.startsWith('about:'));
    expect(external).toEqual([]);
  });

  test('三幕故事：所有台词牌都印在同一横带上（后面幕的牌不沉到窗口下方）', async ({ page }) => {
    // 构造 3 幕故事
    await page.locator('[data-testid="add-act"]').click();
    await page.locator('[data-testid="text-0-0"]').fill('第一幕的台词');
    await page.locator('[data-testid="text-1-0"]').fill('第二幕的台词');
    await page.locator('[data-testid="text-2-0"]').fill('第三幕的台词');
    await page.locator('[data-testid="solve-btn"]').click();
    await expect(page.locator('[data-testid="proof-ok"]')).toBeVisible();
    await page.locator('[data-testid="print-btn"]').click();

    const frameEl = page.frameLocator('iframe[data-testid="print-frame"]');
    await expect(frameEl.locator('.printed-card')).toHaveCount(3);

    // 回归点：所有牌的 top 必须一致（在与窗口等高的同一横带内），
    // 旧实现按幕分行，第 3 幕的 top 会是第 1 幕的约 3 倍。
    const rects = await frameEl.locator('.printed-card').evaluateAll(
      (cards) => cards.map((c) => {
        const el = c as HTMLElement;
        return { top: el.offsetTop, height: el.offsetHeight };
      }),
    );
    expect(rects.length).toBe(3);
    expect(new Set(rects.map((r) => r.top)).size).toBe(1);
    // 全部牌从横带顶部开始（旧实现第 3 幕 top ≈ 2× 牌高）
    expect(rects[0].top).toBeLessThanOrEqual(rects[0].height * 0.2);

    // 条带高度只够一行牌（旧实现 3 幕时约为 3 行）
    const stripInfo = await frameEl.locator('.strip-body').first().evaluate(
      (el) => {
        const body = el as HTMLElement;
        const firstCard = body.querySelector('.printed-card') as HTMLElement;
        return {
          bodyHeight: body.offsetHeight,
          cardHeight: firstCard.offsetHeight,
        };
      },
    );
    expect(stripInfo.bodyHeight).toBeLessThanOrEqual(stripInfo.cardHeight * 1.3);
    expect(stripInfo.bodyHeight).toBeGreaterThanOrEqual(stripInfo.cardHeight * 0.95);

    // 每张牌都完整落在横带高度内（底边不超出条带）
    const bottoms = rects.map((r) => r.top + r.height);
    expect(Math.max(...bottoms)).toBeLessThanOrEqual(stripInfo.bodyHeight + 1);
  });
});

test.describe('草稿恢复', () => {
  test('刷新后草稿仍在，并出现恢复提示条', async ({ page }) => {
    await page.goto('./');
    await page.locator('[data-testid="text-0-0"]').fill('我的冒险故事');
    await page.reload();
    await expect(page.locator('[data-testid="restore-banner"]')).toBeVisible();
    await expect(page.locator('[data-testid="text-0-0"]')).toHaveValue('我的冒险故事');
  });

  test('点“重新开始”可清空草稿', async ({ page }) => {
    await page.goto('./');
    await page.locator('[data-testid="text-0-0"]').fill('要被清掉的话');
    // 对话框自动接受
    page.once('dialog', (d) => d.accept());
    await page.locator('[data-testid="reset-btn"]').click();
    await expect(page.locator('[data-testid="text-0-0"]')).toHaveValue('');
    await page.reload();
    await expect(page.locator('[data-testid="text-0-0"]')).toHaveValue('');
    await expect(page.locator('[data-testid="restore-banner"]')).toHaveCount(0);
  });
});
