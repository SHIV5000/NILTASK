import { sb } from './config.js';
import { currentUser } from './state.js';

let currentReminderMessageId = null;

export function showReminderModal(messageId, messageText) {
    currentReminderMessageId = messageId;
    const modal = document.getElementById('reminderModal');
    document.getElementById('reminderMessagePreview').innerText = messageText.substring(0, 100);
    const defaultDateTime = new Date(Date.now() + 60*60*1000).toISOString().slice(0, 16);
    document.getElementById('reminderDateTime').value = defaultDateTime;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

export function closeReminderModal() {
    const modal = document.getElementById('reminderModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    currentReminderMessageId = null;
}

export async function saveReminder() {
    if (!currentReminderMessageId) return;
    const reminderTime = document.getElementById('reminderDateTime').value;
    if (!reminderTime) {
        alert('Please select a date and time');
        return;
    }
    const { error } = await sb.from('reminders').insert({
        user_id: currentUser.id,
        message_id: currentReminderMessageId,
        reminder_time: new Date(reminderTime).toISOString(),
        triggered: false
    });
    if (error) alert('Failed to set reminder: ' + error.message);
    else { alert('Reminder set!'); closeReminderModal(); }
}