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
check(config.appName === 'Noted For Action', 'Production Capacitor app name remains unchanged');
check(config.server?.url === 'https://niltask.vercel.app', 'Production Capacitor URL remains production');
check(config.server?.cleartext === false, 'Production Capacitor cleartext traffic remains disabled');

check(workflow.includes('PREVIEW_URL: https://niltask-git-agent-activity-feed-no-flicker-shiv5000s-projects.vercel.app'), 'Preview workflow targets the PR Vercel branch');
check(workflow.includes("config.appId = 'in.niltask.preview';"), 'Preview APK uses an isolated package ID');
check(workflow.includes("config.appName = 'NILTASK Preview';"), 'Preview APK has a distinct visible app name');
check(workflow.includes("url: process.env.PREVIEW_URL"), 'Preview URL is applied only inside the build workspace');
check(workflow.includes('npx cap add android'), 'Preview workflow generates an isolated Android project');
check(workflow.includes('./gradlew assembleDebug --no-daemon'), 'Preview workflow builds a debug APK');
check(workflow.includes('NILTASK-Preview-PR204.apk'), 'Preview workflow exports the expected APK filename');
check(workflow.includes('retention-days: 7'), 'Preview artifact has bounded retention');

if (failures.length) {
  console.error(`\nMobile preview validation FAILED (${failures.length}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log('\nMobile preview APK isolation validation passed.');
