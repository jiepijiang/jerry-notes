/**
 * verify-search.mjs —— 验「自己找得到」：多词检索 + 标签检索
 *
 * 起因（2026-10-09）：Jerry 说「我不需要 SEO，我要的是自己方便在知识库里检索」。
 * 于是查了 `GlobalSearch.vue` 和 `DirectoryView.vue`，发现两处都是把
 * **整串查询**当**一个子串**匹配：
 *
 *     const needle = q.value.trim().toLowerCase()
 *     if (n.title.toLowerCase().includes(needle)) …
 *
 * → 搜 `省略号 flex` 时找的是「省略号 flex」这**连着带空格的一串**，必然 0 结果。
 *   而「记得写过、忘了标题」的时候，人天然会敲多个词。
 *
 * 本探针先量基线（多词那几条**应该红**），改完再转绿。
 *
 * 🔴 关键设计：**必须有反向对照。**
 *    `图标 密度` 这两个词各自都出现在若干篇里，但**没有一篇同时含两者**。
 *    所以它是「AND 语义」的判据 —— 如果有人把实现写成 OR，这条会立刻红。
 *    只验「多词能命中」是不够的：OR 也能让多词命中，但那是错的。
 *
 * 用法：
 *   node scripts/verify-search.mjs                          # 默认 dev 5175
 *   node scripts/verify-search.mjs http://127.0.0.1:5200/jerry-notes/   # 或 dist
 */
import pw from './lib/playwright.mjs'

const BASE = (() => {
  const b = process.argv[2] || 'http://127.0.0.1:5175/'
  return b.endsWith('/') ? b : b + '/'
})()

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let pass = 0
let fail = 0
const failures = []
function check(name, ok, detail = '') {
  if (ok) {
    pass++
    console.log(`  ✅ ${name}`)
  } else {
    fail++
    failures.push(name)
    console.log(`  ❌ ${name}${detail ? '  → ' + detail : ''}`)
  }
}
const section = (t) => console.log(`\n【${t}】`)

const proxyOpt = process.env.NO_PROXY_BROWSER
  ? {}
  : { proxy: { server: 'http://127.0.0.1:7897', bypass: '127.0.0.1,localhost' } }

const url = (p) => new URL(String(p).replace(/^\//, ''), BASE).href

async function waitReady(page) {
  // 等首屏挂载 + 笔记数据到位（有行 或 有空态）
  await page.waitForFunction(
    () => !!document.querySelector('#app > *:not(.boot-splash)'),
    null,
    { timeout: 40000 },
  )
  await page.waitForSelector('.row-item, .notice', { timeout: 30000 }).catch(() => {})
  await sleep(600)
}

/** 顶栏全局搜索：输入关键词，返回结果条数与标题 */
async function search(page, kw) {
  const input = page.locator('.gs-input')
  await input.click()
  await input.fill('')
  await input.fill(kw)
  await sleep(700)
  const items = await page.locator('.gs-item').count()
  const titles = await page.locator('.gs-item-title').allInnerTexts()
  return { count: items, titles }
}

/** /all 页面：读筛选框 + 关键词，返回行数 */
async function allRows(page, query) {
  await page.goto(url('all') + query, { waitUntil: 'domcontentloaded' })
  await waitReady(page)
  return page.locator('.row-item').count()
}

const browser = await pw.chromium.launch({ headless: true, ...proxyOpt })
try {
  /* ---------------------------------------------------------------- 顶栏搜索 */
  section('① 顶栏全局搜索：多词必须能命中')
  {
    const page = await browser.newContext({ viewport: { width: 1440, height: 1000 } }).then((c) => c.newPage())
    await page.goto(url(''), { waitUntil: 'domcontentloaded' })
    await waitReady(page)

    const r1 = await search(page, '省略号 flex')
    console.log(`     「省略号 flex」 → ${r1.count} 条 ${JSON.stringify(r1.titles.slice(0, 3))}`)
    check('多词「省略号 flex」能命中（该篇确实同时含这两个词）', r1.count >= 1, `${r1.count} 条`)

    const r2 = await search(page, '部署 子路径')
    console.log(`     「部署 子路径」 → ${r2.count} 条`)
    check('多词「部署 子路径」能命中', r2.count >= 1, `${r2.count} 条`)

    const r3 = await search(page, '图标 密度')
    console.log(`     「图标 密度」 → ${r3.count} 条（两个词各自都有，但没有一篇同时含两者）`)
    check('🔴 反向：多词是 AND 不是 OR —— 「图标 密度」必须是 0 条', r3.count === 0, `${r3.count} 条`)

    const r4 = await search(page, '省略号')
    console.log(`     「省略号」 → ${r4.count} 条`)
    check('单词查询不回归：「省略号」仍有结果', r4.count >= 1, `${r4.count} 条`)

    await page.context().close()
  }

  /* ---------------------------------------------------------------- /all 页 */
  section('② /all 全部笔记：多词筛选 + 标签筛选')
  {
    const page = await browser.newContext({ viewport: { width: 1440, height: 1000 } }).then((c) => c.newPage())
    await page.goto(url(''), { waitUntil: 'domcontentloaded' })
    await waitReady(page)

    const q1 = await allRows(page, '?q=' + encodeURIComponent('省略号 flex'))
    console.log(`     /all?q=省略号 flex → ${q1} 行`)
    check('/all 多词筛选能命中', q1 >= 1, `${q1} 行`)

    const q2 = await allRows(page, '?q=' + encodeURIComponent('图标 密度'))
    console.log(`     /all?q=图标 密度 → ${q2} 行`)
    check('🔴 反向：/all 也是 AND —— 「图标 密度」必须是 0 行', q2 === 0, `${q2} 行`)

    const q3 = await allRows(page, '?q=' + encodeURIComponent('省略号'))
    console.log(`     /all?q=省略号 → ${q3} 行`)
    check('单词筛选不回归', q3 >= 1, `${q3} 行`)

    /* 标签：直接开 URL */
    const t1 = await allRows(page, '?tag=' + encodeURIComponent('复刻'))
    console.log(`     /all?tag=复刻 → ${t1} 行（期望 6）`)
    check('/all?tag=复刻 筛出 6 篇', t1 === 6, `${t1} 行`)

    /*
     * ⚠️ `Vue` 是 **2**，不是 3、也不是 4 —— 这个数字踩过两次坑，别「顺手改回去」：
     *
     *   ① `grep -rl "Vue" notes/` 会数出 **3** —— 因为
     *      `notes/2026-09-20-notes-convention.md` 的**正文里有一个 ```yaml 代码块**，
     *      里面在示范 frontmatter 写法（`tags: [Vue, 性能]`）。
     *      那篇**根本没有 frontmatter**（它从 `# 标题` 开始），
     *      解析器当然不该把它算进去 —— **应用是对的**。
     *   ② 如果同时把「递归 glob」和「顶层 glob」两个模式传给 grep，
     *      顶层笔记会被算两遍，于是 3 又变成 4。
     *
     * 正确口径：只看**文件头几行的真实 frontmatter**。
     * 这条断言顺带钉住「代码块里的 tags 不算标签」这件事。
     */
    const t2 = await allRows(page, '?tag=' + encodeURIComponent('Vue'))
    console.log(`     /all?tag=Vue → ${t2} 行（期望 2；grep 会数出 3，见注释）`)
    check('/all?tag=Vue 筛出 2 篇（代码块里的示范不算）', t2 === 2, `${t2} 行`)

    const t3 = await allRows(page, '?tag=' + encodeURIComponent('这个标签不存在'))
    console.log(`     /all?tag=这个标签不存在 → ${t3} 行`)
    check('不存在的标签 → 0 行（不是「忽略筛选」返回全部）', t3 === 0, `${t3} 行`)

    /* 标签与状态可以叠加 */
    const t4 = await allRows(page, '?tag=' + encodeURIComponent('复刻') + '&status=implemented')
    console.log(`     /all?tag=复刻&status=implemented → ${t4} 行（应 ≤ 6）`)
    check('标签与状态能叠加筛选', t4 > 0 && t4 <= 6, `${t4} 行`)

    /* 点标签（列表里的 .cell-tag）→ 应该跳到带 tag 的 URL */
    await page.goto(url('all'), { waitUntil: 'domcontentloaded' })
    await waitReady(page)
    const tagEl = page.locator('.cell-tag', { hasText: '复刻' }).first()
    const tagCount = await tagEl.count()
    check('列表里能点到「复刻」这个标签', tagCount > 0, `${tagCount} 个`)
    if (tagCount > 0) {
      await tagEl.click()
      await sleep(900)
      const u = new URL(page.url())
      const rows = await page.locator('.row-item').count()
      console.log(`     点击后 URL = ${u.pathname}?${u.searchParams.toString()} → ${rows} 行`)
      check('点标签后 URL 带上 tag=', u.searchParams.get('tag') === '复刻', u.search)
      check('点标签后列表被筛成 6 行', rows === 6, `${rows} 行`)
    }

    await page.context().close()
  }

  /* ---------------------------------------------------------------- 抽屉里的标签 */
  section('③ 笔记抽屉里的标签也要能点')
  {
    const page = await browser.newContext({ viewport: { width: 1440, height: 1000 } }).then((c) => c.newPage())
    await page.goto(url('all'), { waitUntil: 'domcontentloaded' })
    await waitReady(page)

    // 打开一篇带标签的笔记
    await page.locator('.row-item').first().click()
    await sleep(900)
    const drawer = await page.locator('.dw-tag').count()
    console.log(`     抽屉里有 ${drawer} 个标签`)
    check('抽屉里渲染出了标签', drawer > 0, `${drawer} 个`)
    if (drawer > 0) {
      const before = new URL(page.url()).searchParams.get('tag')
      await page.locator('.dw-tag').first().click()
      await sleep(1000)
      const u = new URL(page.url())
      const rows = await page.locator('.row-item').count()
      console.log(`     点抽屉里的标签 → ${u.pathname}?${u.searchParams.toString()} → ${rows} 行`)
      check(
        '点抽屉里的标签也能筛（URL 带上 tag=）',
        u.searchParams.get('tag') !== null && u.searchParams.get('tag') !== before,
        u.search,
      )
      check('点完确实筛出了结果', rows > 0, `${rows} 行`)
    }

    await page.context().close()
  }
} finally {
  await browser.close()
}

console.log(`\n合计 ${pass} 通过 / ${fail} 失败`)
if (fail) console.log('失败项：\n  - ' + failures.join('\n  - '))
process.exit(fail ? 1 : 0)
