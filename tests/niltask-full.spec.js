// tests/niltask-full.spec.js
import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';

// ----- Helpers -----
async function login(page, email, password) {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('#login-button');
  await page.waitForURL(`${BASE_URL}/rooms/**`);
}

async function createTenantAndPrincipal(page, school, principal, email, pass, subdomain) {
  await page.goto(`${BASE_URL}/signup`);
  await page.fill('#school_name', school);
  await page.fill('#principal_name', principal);
  await page.fill('#email', email);
  await page.fill('#password', pass);
  await page.fill('#subdomain', subdomain);
  await page.click('#signup-button');
  await page.waitForURL(`${BASE_URL}/login`);
}

// ----- Test Suite -----
test.describe('NILTASK Full Flow', () => {
  const PRINCIPAL_EMAIL = 'principal@test.com';
  const PRINCIPAL_PASS = 'Test123!';
  const TEACHER_EMAIL = 'teacher@test.com';
  const TEACHER_PASS = 'Test123!';
  const SUBDOMAIN = 'test-school';

  test('1. Signup – new school + principal becomes admin', async ({ page }) => {
    await createTenantAndPrincipal(page, 'Test School', 'Principal', PRINCIPAL_EMAIL, PRINCIPAL_PASS, SUBDOMAIN);
    await login(page, PRINCIPAL_EMAIL, PRINCIPAL_PASS);
    await expect(page.locator('.user-menu')).toContainText('Principal');
  });

  test('2. Admin adds a teacher (allowed_users)', async ({ page }) => {
    await login(page, PRINCIPAL_EMAIL, PRINCIPAL_PASS);
    await page.click('#manage-users');
    await page.click('#add-user');
    await page.fill('#add-email', TEACHER_EMAIL);
    await page.fill('#add-fullname', 'Teacher');
    await page.selectOption('#add-role', 'Teacher');
    await page.click('#save-user');
    await expect(page.locator(`.user-row:has-text("${TEACHER_EMAIL}")`)).toBeVisible();
    await page.click(`.user-row:has-text("${TEACHER_EMAIL}") .approve-btn`);
  });

  test('3. Teacher logs in and joins a room', async ({ page }) => {
    await login(page, TEACHER_EMAIL, TEACHER_PASS);
    await expect(page.locator('.user-menu')).toContainText('Teacher');
    await page.goto(`${BASE_URL}/rooms/general`);
    await expect(page).toHaveURL(/.*rooms\/general/);
  });

  test('4. Messaging – send and receive toast notification', async ({ browser }) => {
    const principalCtx = await browser.newContext();
    const principalPage = await principalCtx.newPage();
    const teacherCtx = await browser.newContext();
    const teacherPage = await teacherCtx.newPage();

    await login(principalPage, PRINCIPAL_EMAIL, PRINCIPAL_PASS);
    await login(teacherPage, TEACHER_EMAIL, TEACHER_PASS);

    await principalPage.goto(`${BASE_URL}/rooms/general`);
    await teacherPage.goto(`${BASE_URL}/rooms/general`);

    const msg = `Hello from Principal ${Date.now()}`;
    await principalPage.fill('#message-input', msg);
    await principalPage.click('#send-button');

    const toast = teacherPage.locator(`.toast:has-text("${msg}")`);
    await expect(toast).toBeVisible({ timeout: 10000 });

    const badge = teacherPage.locator('.bell-wrapper .badge');
    await expect(badge).toHaveText('1');
  });

  test('5. Reply to a message', async ({ browser }) => {
    const principalCtx = await browser.newContext();
    const principalPage = await principalCtx.newPage();
    const teacherCtx = await browser.newContext();
    const teacherPage = await teacherCtx.newPage();

    await login(principalPage, PRINCIPAL_EMAIL, PRINCIPAL_PASS);
    await login(teacherPage, TEACHER_EMAIL, TEACHER_PASS);

    const msg = 'Hi, I need help with tasks';
    await teacherPage.goto(`${BASE_URL}/rooms/general`);
    await teacherPage.fill('#message-input', msg);
    await teacherPage.click('#send-button');

    await principalPage.goto(`${BASE_URL}/rooms/general`);
    await principalPage.click(`.message:has-text("${msg}") .reply-btn`);
    await principalPage.fill('.reply-input', 'I will assign a task now');
    await principalPage.click('.reply-send');

    const toast = teacherPage.locator(`.toast:has-text("I will assign a task now")`);
    await expect(toast).toBeVisible({ timeout: 10000 });
  });

  test('6. Convert a message to a task', async ({ browser }) => {
    const principalCtx = await browser.newContext();
    const principalPage = await principalCtx.newPage();
    const teacherCtx = await browser.newContext();
    const teacherPage = await teacherCtx.newPage();

    await login(principalPage, PRINCIPAL_EMAIL, PRINCIPAL_PASS);
    await login(teacherPage, TEACHER_EMAIL, TEACHER_PASS);

    const msg = 'Please prepare the report by Friday';
    await principalPage.goto(`${BASE_URL}/rooms/general`);
    await principalPage.fill('#message-input', msg);
    await principalPage.click('#send-button');

    await principalPage.click(`.message:has-text("${msg}") .three-dots`);
    await principalPage.click('.convert-to-task');
    await principalPage.fill('#task-title', 'Prepare report');
    await principalPage.selectOption('#task-assignee', TEACHER_EMAIL);
    await principalPage.fill('#task-deadline', '2025-12-31');
    await principalPage.selectOption('#task-priority', 'High');
    await principalPage.click('#task-submit');

    const toast = teacherPage.locator(`.toast:has-text("Prepare report")`);
    await expect(toast).toBeVisible({ timeout: 10000 });

    await teacherPage.goto(`${BASE_URL}/tasks`);
    await expect(teacherPage.locator('.task-card:has-text("Prepare report")')).toBeVisible();
  });

  test('7. Task lifecycle – status transitions', async ({ browser }) => {
    const principalCtx = await browser.newContext();
    const principalPage = await principalCtx.newPage();
    const teacherCtx = await browser.newContext();
    const teacherPage = await teacherCtx.newPage();

    await login(principalPage, PRINCIPAL_EMAIL, PRINCIPAL_PASS);
    await login(teacherPage, TEACHER_EMAIL, TEACHER_PASS);

    await teacherPage.goto(`${BASE_URL}/tasks`);
    await teacherPage.click('.task-card:has-text("Prepare report")');
    await teacherPage.click('#acknowledge-btn');
    await teacherPage.click('#submit-review-btn');

    await principalPage.goto(`${BASE_URL}/tasks`);
    await principalPage.click('.task-card:has-text("Prepare report")');
    await principalPage.click('#accept-btn');

    await teacherPage.goto(`${BASE_URL}/tasks`);
    const taskCard = teacherPage.locator('.task-card:has-text("Prepare report") .task-status');
    await expect(taskCard).toHaveText('Done');
  });

  test('8. Set a reminder on a message', async ({ page }) => {
    await login(page, TEACHER_EMAIL, TEACHER_PASS);
    await page.goto(`${BASE_URL}/rooms/general`);

    const msg = 'Please prepare the report by Friday';
    await page.click(`.message:has-text("${msg}") .three-dots`);
    await page.click('.set-reminder');

    const future = new Date(Date.now() + 60000);
    const timeStr = future.toISOString().slice(0,16);
    await page.fill('#reminder-time', timeStr);
    await page.click('#save-reminder');

    // Call the reminder processing endpoint
    const response = await page.request.post(`${BASE_URL}/api/process-reminders`);
    expect(response.ok()).toBeTruthy();

    const toast = page.locator(`.toast:has-text("Reminder:")`);
    await expect(toast).toBeVisible({ timeout: 5000 });
  });

  test('9. Bookmark a message', async ({ page }) => {
    await login(page, TEACHER_EMAIL, TEACHER_PASS);
    await page.goto(`${BASE_URL}/rooms/general`);
    const msg = 'Please prepare the report by Friday';
    await page.click(`.message:has-text("${msg}") .three-dots`);
    await page.click('.bookmark');

    await page.goto(`${BASE_URL}/bookmarks`);
    await expect(page.locator(`.bookmark-item:has-text("${msg}")`)).toBeVisible();
  });

  test('10. Reaction on a message', async ({ browser }) => {
    const principalCtx = await browser.newContext();
    const principalPage = await principalCtx.newPage();
    const teacherCtx = await browser.newContext();
    const teacherPage = await teacherCtx.newPage();

    await login(principalPage, PRINCIPAL_EMAIL, PRINCIPAL_PASS);
    await login(teacherPage, TEACHER_EMAIL, TEACHER_PASS);

    const msg = 'Great job everyone!';
    await principalPage.goto(`${BASE_URL}/rooms/general`);
    await principalPage.fill('#message-input', msg);
    await principalPage.click('#send-button');

    await teacherPage.goto(`${BASE_URL}/rooms/general`);
    await teacherPage.click(`.message:has-text("${msg}") .reaction-btn`);
    await teacherPage.click('.emoji-👍');

    const toast = principalPage.locator(`.toast:has-text("reacted with 👍")`);
    await expect(toast).toBeVisible({ timeout: 5000 });
  });

  test('11. Scheduled message', async ({ browser }) => {
    const teacherCtx = await browser.newContext();
    const teacherPage = await teacherCtx.newPage();
    const principalCtx = await browser.newContext();
    const principalPage = await principalCtx.newPage();

    await login(teacherPage, TEACHER_EMAIL, TEACHER_PASS);
    await login(principalPage, PRINCIPAL_EMAIL, PRINCIPAL_PASS);

    await teacherPage.goto(`${BASE_URL}/scheduled`);
    await teacherPage.click('#new-scheduled-message');
    await teacherPage.fill('#scheduled-text', 'Reminder: Meeting at 3 PM');
    await teacherPage.selectOption('#scheduled-room', 'general');

    const future = new Date(Date.now() + 120000);
    const timeStr = future.toISOString().slice(0,16);
    await teacherPage.fill('#scheduled-time', timeStr);
    await teacherPage.click('#save-scheduled');

    const response = await teacherPage.request.post(`${BASE_URL}/api/process-scheduled`);
    expect(response.ok()).toBeTruthy();

    await principalPage.goto(`${BASE_URL}/rooms/general`);
    await expect(principalPage.locator(`.message:has-text("Reminder: Meeting at 3 PM")`)).toBeVisible();
  });

  test('12. Notification center – badge and dropdown', async ({ page }) => {
    await login(page, TEACHER_EMAIL, TEACHER_PASS);
    const badge = page.locator('.bell-wrapper .badge');
    const count = await badge.textContent();
    expect(Number(count)).toBeGreaterThan(0);

    await page.click('.bell-wrapper');
    const dropdown = page.locator('.notif-dropdown');
    await expect(dropdown).toBeVisible();
    const items = page.locator('.notif-item');
    await expect(items).toHaveCount(Number(count));
  });

  test('13. Mark notifications as read', async ({ page }) => {
    await login(page, TEACHER_EMAIL, TEACHER_PASS);
    await page.click('.bell-wrapper');
    await page.click('#markAllReadBtn');
    const badge = page.locator('.bell-wrapper .badge');
    await expect(badge).toHaveText('0');
  });
});
