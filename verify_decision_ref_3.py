from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:3000")

        # Click the '行动' tab
        try:
            page.get_by_role("button", name="📜 行动").click(timeout=3000)
        except Exception as e:
            print(f"Could not click '行动' via role: {e}")
            page.locator('div[data-target="tab-action"]').click()

        time.sleep(1)

        # Hide the exact role-login-overlay found in index.html
        page.evaluate('''
            const loginOverlay = document.getElementById('role-login-overlay');
            if (loginOverlay) loginOverlay.style.display = 'none';
            document.body.style.overflow = 'auto'; // Re-enable scroll just in case
        ''')

        time.sleep(1)
        page.screenshot(path="/home/jules/verification/screenshots/verification_clear_2.png")
        browser.close()

if __name__ == "__main__":
    run()
