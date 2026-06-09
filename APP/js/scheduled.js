import { sb } from './config.js';
import { currentUser } from './state.js';

let currentScheduleMessageText = '';

export function showScheduleModal(messageText) {
    currentScheduleMessageText = messageText;
    const modal = document.getElementById('scheduleModal');
    document.getElementById('scheduleMessageText').value = messageText;
    document.getElementById('scheduleDateTime').value = '';
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

export function closeScheduleModal() {
    const modal = document.getElementById('scheduleModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

export async function saveScheduledMessage() {
    const messageText = document.getElementById('scheduleMessageText').value.trim();
    const roomId = document.getElementById('scheduleChannel').value;
    const scheduledTime = document.getElementById('scheduleDateTime').value;
    if (!messageText || !scheduledTime) {
        alert('Please enter a message and select a time');
        return;
    }
    const { error } = await sb.from('scheduled_messages').insert({
        sender_id: currentUser.id,
        room_id: roomId,
        message_text: messageText,
        scheduled_time: new Date(scheduledTime).toISOString(),
        status: 'pending'
    });
    if (error) alert('Failed to schedule message: ' + error.message);
    else { alert('Message scheduled!'); closeScheduleModal(); }
}