import asyncio
from playwright.async_api import async_playwright

HTML_FILE = "http://localhost:3000/index.html"

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1280, "height": 1800})

        await page.goto(HTML_FILE)
        await page.wait_for_timeout(1000)

        # Override save logic to mock fetch to supabase since it's failing
        await page.evaluate("""
        window.saveRoundToDB = async function(parsed, rawContent) {
           return { id: Math.random().toString(36).substring(7) };
        }
        """)

        # Click GM tab
        await page.evaluate("document.querySelector('.gm-nav-btn').click()")
        await page.wait_for_timeout(500)

        test_data_1 = """========================================
[回合] 第1回合
[节气] 春-仲·细雨
[速递] 测试样本

[甲] 名号:玩家甲
金:500 粮:3200 兵:1500 民心:65 城:1
城池:陈留(荀彧/任峻|步:1200,骑:300)
武将:荀彧(),任峻()

[NPC] 城池:邺城[袁绍](袁绍/审配/逢纪|步:3000,骑:1500),南皮[袁绍](袁谭|步:2000),平原[袁绍](逢纪|步:1500),许昌[曹操](荀彧/夏侯惇|步:4000,骑:1000),濮阳[曹操](夏侯惇|步:2500),小沛[曹操](曹仁|步:1800),谯郡[曹操](夏侯渊|步:2000),襄阳[刘表](蔡瑁/张允|步:2500,水:1500),宛城(张绣|步:1500)

[战报]
本回合无战事

[摘要] 测试样本
========================================"""

        await page.evaluate("(val) => document.querySelector('#gm-content').value = val", test_data_1)
        await page.evaluate("document.querySelector('#btn-preview').click()")
        await page.wait_for_timeout(500)
        await page.evaluate("document.querySelector('#btn-publish').click()")
        await page.wait_for_timeout(1000)

        # Now go back to arena tab and screenshot
        await page.evaluate("document.querySelector('.nav-btn[data-tab=\"arena\"]').click()")
        await page.wait_for_timeout(1000)
        await page.screenshot(path="screenshot_turn1_arena.png")
        print("Turn 1 Arena Screenshot captured.")

        # Go to GM
        await page.evaluate("document.querySelector('.gm-nav-btn').click()")
        await page.wait_for_timeout(500)

        test_data_2 = """========================================
[回合] 第2回合
[节气] 春-仲·细雨
[速递] 测试样本

[甲] 名号:玩家甲
金:500 粮:3200 兵:1500 民心:65 城:1
城池:陈留(荀彧/任峻|步:1200,骑:300)
武将:荀彧(),任峻()

[NPC] 城池:邺城[袁绍](袁绍/审配/逢纪|步:3000,骑:1500),南皮[袁绍](袁谭|步:2000),平原[袁绍](逢纪|步:1500),晋阳[袁绍](高干|骑:2000),北海[袁绍](袁谭|步:2000),许昌[曹操](荀彧/夏侯惇|步:4000,骑:1000),濮阳[曹操](夏侯惇|步:2500),小沛[曹操](曹仁|步:1800),谯郡[曹操](夏侯渊|步:2000),襄阳[刘表](蔡瑁/张允|步:2500,水:1500),宛城(张绣|步:1500)

[战报]
本回合无战事

[摘要] 测试样本
========================================"""

        await page.evaluate("(val) => document.querySelector('#gm-content').value = val", test_data_2)
        await page.evaluate("document.querySelector('#btn-preview').click()")
        await page.wait_for_timeout(500)
        await page.evaluate("document.querySelector('#btn-publish').click()")
        await page.wait_for_timeout(1000)

        await page.evaluate("document.querySelector('.nav-btn[data-tab=\"arena\"]').click()")
        await page.wait_for_timeout(1000)
        await page.screenshot(path="screenshot_turn2_arena.png")
        print("Turn 2 Arena Screenshot captured.")

        # Go to GM
        await page.evaluate("document.querySelector('.gm-nav-btn').click()")
        await page.wait_for_timeout(500)

        test_data_3 = """========================================
[回合] 第3回合
[节气] 春-仲·细雨
[速递] 测试样本

[甲] 名号:玩家甲
金:500 粮:3200 兵:1500 民心:65 城:1
城池:陈留(荀彧/任峻|步:1200,骑:300)
武将:荀彧(),任峻()

[NPC] 城池:邺城[袁绍](袁绍/审配/逢纪|步:3000,骑:1500),南皮[袁绍](袁谭|步:2000),平原[袁绍](逢纪|步:1500),晋阳[袁绍](高干|骑:2000),北海[袁绍](袁谭|步:2000),许昌[曹操](荀彧/夏侯惇|步:4000,骑:1000),濮阳[曹操](夏侯惇|步:2500),建业[孙策](周瑜|水:2000),吴郡[孙策](程普|步:1500),会稽[孙策](黄盖|步:1500),襄阳[刘表](蔡瑁/张允|步:2500,水:1500),宛城(张绣|步:1500)

[战报]
本回合无战事

[摘要] 测试样本
========================================"""

        await page.evaluate("(val) => document.querySelector('#gm-content').value = val", test_data_3)
        await page.evaluate("document.querySelector('#btn-preview').click()")
        await page.wait_for_timeout(500)
        await page.evaluate("document.querySelector('#btn-publish').click()")
        await page.wait_for_timeout(1000)

        await page.evaluate("document.querySelector('.nav-btn[data-tab=\"arena\"]').click()")
        await page.wait_for_timeout(1000)
        await page.screenshot(path="screenshot_turn3_arena.png")
        print("Turn 3 Arena Screenshot captured.")

        # Test Color Picker
        await page.evaluate("document.querySelector('.gm-nav-btn').click()")
        await page.wait_for_timeout(500)

        await page.click('.color-panel-summary', force=True)
        await page.wait_for_timeout(500)

        await page.evaluate("document.querySelector('.color-row[data-key=\"p0\"] .color-picker[data-target=\"strip\"]').value = '#ffff00'")
        await page.evaluate("document.querySelector('.color-row[data-key=\"p0\"] .color-picker[data-target=\"strip\"]').dispatchEvent(new Event('input', {bubbles: true}))")

        await page.wait_for_timeout(1000)

        await page.evaluate("document.querySelector('.nav-btn[data-tab=\"arena\"]').click()")
        await page.wait_for_timeout(1000)
        await page.screenshot(path="screenshot_color_changed_arena.png")
        print("Color changed Arena Screenshot captured.")

        await browser.close()

asyncio.run(main())
