import fs from 'node:fs';

const failures = [];
const pass = label => console.log(`✓ ${label}`);
const check = (condition, label) => {
  if (condition) pass(label);
  else failures.push(label);
};

const config = JSON.parse(fs.readFileSync('capacitor.config.json', 'utf8'));
const workflow = fs.readFileSync('.github/workflows/mobile-preview-apk.yml', 'utf8');

check(config.appId === 'in.niltask.app', 'Production Capacitor app ID remains in.niltask.app');
check(config.appName === 'Noted For Action', 'Production Capacitor app name remains Noted For Action');
check(config.server?.url === 'https://niltask.vercel.app', 'Production Capacitor URL remains production');
check(config.server?.cleartext === false, 'Production Capacitor cleartext traffic remains disabled');

check(workflow.includes('PREVIEW_URL: https://niltask-git-agent-noted-for-action-di-72bf14-shiv5000s-projects.vercel.app'), 'Preview workflow targets the distinctive UI Vercel branch');
check(workflow.includes("config.appId = 'in.niltask.preview';"), 'Preview APK uses an isolated package ID');
check(workflow.includes("config.appName = 'Noted For Action Preview';"), 'Preview APK uses the approved product name');
check(workflow.includes('url: process.env.PREVIEW_URL'), 'Preview URL is applied only inside the build workspace');
check(workflow.includes("- 'agent/**'"), 'Preview workflow supports isolated agent branches');
check(workflow.includes("- 'css/**'"), 'Preview APK rebuilds for presentation-layer changes');
check(workflow.includes('npx cap add android'), 'Preview workflow generates an isolated Android project');
check(workflow.includes('./gradlew assembleDebug --no-daemon'), 'Preview workflow builds a debug APK');
check(workflow.includes('Noted-For-Action-Preview-PR205.apk'), 'Preview workflow exports the branded APK filename');
check(workflow.includes('retention-days: 7'), 'Preview artifact has bounded retention');

if (failures.length) {
  console.error(`\nMobile preview validation FAILED (${failures.length}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log('\nMobile preview APK isolation validation passed.');
