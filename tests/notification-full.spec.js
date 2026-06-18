// tests/notification-full.spec.js
import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';

// Helper: login with email/password
async function login(page, email, password) {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('#login-button');
  await page.waitForURL(`${BASE_URL}/rooms/**`);
}

// Helper: create a test user (via API or UI)
async function createTestUser(page, email, password, fullName) {
  await page.goto(`${BASE_URL}/signup`);
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.fill('#full_name', fullName);
  await page.click('#signup-button');
  // Wait for redirect or success message
  await page.waitForURL(`${BASE_URL}/login`);
}

test.describe('NILTASK Notification Suite', () => {

  test('1. Sign up a new user', async ({ page }) => {
    const email = `test-${Date.now()}@example.com`;
    await createTestUser(page, email, 'Test123!', 'Test User');
    // Verify user exists in DB? We can call Supabase API.
    // For simplicity, we check login works after signup.
    await login(page, email, 'Test123!');
    await expect(page).toHaveURL(/.*rooms.*/);
  });

  test('2. Login as existing user', async ({ page }) => {
    await login(page, 'alex@test.com', 'password123');
    await expect(page.locator('.user-menu')).toContainText('Alex');
  });

  test('3. In-app toast notification for new message', async ({ browser }) => {
    const userA = await browser.newContext();
    const pageA = await userA.newPage();
    const userB = await browser.newContext();
    const pageB = await userB.newPage();

    await login(pageA, 'alex@test.com', 'password123');
    await login(pageB, 'emily@test.com', 'password123');

    // Both in same room
    await pageA.goto(`${BASE_URL}/rooms/general`);
    await pageB.goto(`${BASE_URL}/rooms/general`);

    const testMsg = `E2E toast ${Date.now()}`;
    await pageA.fill('#message-input', testMsg);
    await pageA.click('#send-button');

    // User B sees toast
    const toast = pageB.locator(`.toast:has-text("${testMsg}")`);
    await expect(toast).toBeVisible({ timeout: 10000 });
  });

  test('4. System notification (background)', async ({ browser }) => {
    const userA = await browser.newContext();
    const pageA = await userA.newPage();
    const userB = await browser.newContext({
      permissions: ['notifications'] // grant permission
    });
    const pageB = await userB.newPage();

    await login(pageA, 'alex@test.com', 'password123');
    await login(pageB, 'emily@test.com', 'password123');

    // Send userB to a blank page (simulate background)
    await pageB.goto('about:blank');

    const testMsg = `Background test ${Date.now()}`;
    await pageA.goto(`${BASE_URL}/rooms/general`);
    await pageA.fill('#message-input', testMsg);
    await pageA.click('#send-button');

    // We need to listen for the system notification
    // Playwright can catch it via the 'notification' event on the context
    const [notification] = await Promise.all([
      userB.waitForEvent('notification'),
      // The notification should be fired by your service worker or Notification API
    ]);
    expect(notification.body).toContain(testMsg);
  });

  test('5. Notification center – badge and dropdown', async ({ page }) => {
    await login(page, 'emily@test.com', 'password123');
    // Ensure there is at least one unread notification (maybe from previous test)
    // Or trigger one via API
    const badge = page.locator('.bell-wrapper .badge');
    await expect(badge).toHaveText(/\d+/);

    await page.click('.bell-wrapper');
    await expect(page.locator('.notif-dropdown')).toBeVisible();
    const items = page.locator('.notif-item');
    await expect(items).toHaveCount(await badge.textContent().then(Number));
  });

  test('6. Mark notifications as read', async ({ page }) => {
    await login(page, 'emily@test.com', 'password123');
    await page.click('.bell-wrapper');
    await page.click('#markAllReadBtn');
    const badge = page.locator('.bell-wrapper .badge');
    await expect(badge).toHaveText('0');
    // Optionally verify DB `is_read = true`
  });

  test('7. Task assignment notification', async ({ browser }) => {
    const userA = await browser.newContext();
    const pageA = await userA.newPage();
    const userB = await browser.newContext();
    const pageB = await userB.newPage();

    await login(pageA, 'alex@test.com', 'password123');
    await login(pageB, 'emily@test.com', 'password123');

    // Create task via UI or API
    await pageA.goto(`${BASE_URL}/tasks`);
    await pageA.click('#new-task-button');
    await pageA.fill('#task-title', 'Automated Task');
    await pageA.fill('#task-description', 'Test assignment');
    await pageA.selectOption('#assignee-select', 'emily@test.com');
    await pageA.click('#task-submit');

    // UserB should see a toast
    const toast = pageB.locator(`.toast:has-text("Automated Task")`);
    await expect(toast).toBeVisible({ timeout: 10000 });
  });

  test('8. Reminder notification', async ({ page }) => {
    // This requires a mock or a helper to advance time.
    // Example: use Playwright's clock to set time.
    await page.clock.install();
    const future = new Date(Date.now() + 60000); // 1 min later
    await page.goto(`${BASE_URL}/reminders`);
    await page.click('#new-reminder');
    await page.fill('#reminder-title', 'Test Reminder');
    await page.fill('#reminder-time', future.toISOString().slice(0,16));
    await page.click('#save-reminder');

    // Advance clock to past the reminder time
    await page.clock.fastForward(61000);

    // Now wait for toast or system notification
    const toast = page.locator(`.toast:has-text("Test Reminder")`);
    await expect(toast).toBeVisible({ timeout: 5000 });
  });

  test('9. Reply notification', async ({ browser }) => {
    const userA = await browser.newContext();
    const pageA = await userA.newPage();
    const userB = await browser.newContext();
    const pageB = await userB.newPage();

    await login(pageA, 'alex@test.com', 'password123');
    await login(pageB, 'emily@test.com', 'password123');

    // User A sends a message
    const msg = 'Reply test';
    await pageA.goto(`${BASE_URL}/rooms/general`);
    await pageA.fill('#message-input', msg);
    await pageA.click('#send-button');

    // User B replies to that message
    await pageB.goto(`${BASE_URL}/rooms/general`);
    await pageB.click(`.message:has-text("${msg}") .reply-btn`);
    await pageB.fill('.reply-input', 'This is a reply');
    await pageB.click('.reply-send');

    // User A should see a toast
    const toast = pageA.locator(`.toast:has-text("This is a reply")`);
    await expect(toast).toBeVisible({ timeout: 10000 });
  });

  test('10. Reaction notification', async ({ browser }) => {
    const userA = await browser.newContext();
    const pageA = await userA.newPage();
    const userB = await browser.newContext();
    const pageB = await userB.newPage();

    await login(pageA, 'alex@test.com', 'password123');
    await login(pageB, 'emily@test.com', 'password123');

    // User A sends a message
    const msg = 'Reaction test';
    await pageA.goto(`${BASE_URL}/rooms/general`);
    await pageA.fill('#message-input', msg);
    await pageA.click('#send-button');

    // User B adds a reaction (e.g., 👍)
    await pageB.goto(`${BASE_URL}/rooms/general`);
    await pageB.click(`.message:has-text("${msg}") .reaction-btn`);
    await pageB.click('.reaction-emoji[data-emoji="👍"]');

    // User A should see a toast
    const toast = pageA.locator(`.toast:has-text("reacted with 👍")`);
    await expect(toast).toBeVisible({ timeout: 10000 });
  });

  test('11. Room isolation – notifications only for members', async ({ browser }) => {
    const userA = await browser.newContext();
    const pageA = await userA.newPage();
    const userB = await browser.newContext();
    const pageB = await userB.newPage();
    const userC = await browser.newContext();
    const pageC = await userC.newPage();

    await login(pageA, 'alex@test.com', 'password123');
    await login(pageB, 'emily@test.com', 'password123');
    // User C is in a different room 'dev'
    await login(pageC, 'mike@test.com', 'password123');
    await pageC.goto(`${BASE_URL}/rooms/dev`);

    // Send from A in 'general'
    await pageA.goto(`${BASE_URL}/rooms/general`);
    const msg = 'Isolation test';
    await pageA.fill('#message-input', msg);
    await pageA.click('#send-button');

    // B should get toast
    const toastB = pageB.locator(`.toast:has-text("${msg}")`);
    await expect(toastB).toBeVisible({ timeout: 5000 });

    // C should NOT get toast
    const toastC = pageC.locator(`.toast:has-text("${msg}")`);
    await expect(toastC).not.toBeVisible();
  });

  test('12. Permission denied – fallback to toast', async ({ browser }) => {
    // Deny notification permission for this context
    const context = await browser.newContext({ permissions: [] });
    const page = await context.newPage();
    // Also, if the browser denies, you can mock the Notification API
    await page.addInitScript(() => {
      Object.defineProperty(window, 'Notification', {
        value: { permission: 'denied', requestPermission: () => Promise.resolve('denied') }
      });
    });

    await login(page, 'emily@test.com', 'password123');
    // Trigger a message from another user (simulate via direct trigger)
    await page.evaluate(() => {
      window.triggerMessageNotification({
        sender_id: 'mock',
        text: 'Permission denied test',
        room_id: 'general'
      });
    });
    // Toast should still appear
    const toast = page.locator(`.toast:has-text("Permission denied test")`);
    await expect(toast).toBeVisible({ timeout: 5000 });
  });

  test('13. Cross-device synchronization', async ({ browser }) => {
    // Two contexts for the same user (simulating two devices)
    const userBDevice1 = await browser.newContext();
    const pageB1 = await userBDevice1.newPage();
    const userBDevice2 = await browser.newContext();
    const pageB2 = await userBDevice2.newPage();

    await login(pageB1, 'emily@test.com', 'password123');
    await login(pageB2, 'emily@test.com', 'password123');

    // User A sends a message (using a third context)
    const userA = await browser.newContext();
    const pageA = await userA.newPage();
    await login(pageA, 'alex@test.com', 'password123');
    await pageA.goto(`${BASE_URL}/rooms/general`);
    const msg = 'Cross-device test';
    await pageA.fill('#message-input', msg);
    await pageA.click('#send-button');

    // Both devices should see toast
    const toast1 = pageB1.locator(`.toast:has-text("${msg}")`);
    const toast2 = pageB2.locator(`.toast:has-text("${msg}")`);
    await expect(toast1).toBeVisible({ timeout: 5000 });
    await expect(toast2).toBeVisible({ timeout: 5000 });

    // Mark as read on device 1, then check device 2 updates
    await pageB1.click('.bell-wrapper');
    await pageB1.click('#markAllReadBtn');
    // Wait for DB to update and realtime to sync
    await pageB2.waitForTimeout(2000);
    const badge2 = pageB2.locator('.bell-wrapper .badge');
    await expect(badge2).toHaveText('0');
  });
});