import { sb } from './config.js';
import { currentUser, currentRoom, messageSubscription, setMessageSubscription } from './state.js';
import { escapeHtml } from './utils.js';
import { openTaskModal } from './tasks.js';
import { showReminderModal } from './reminders.js';
import { showScheduleModal } from './scheduled.js';
import { toggleBookmark } from './bookmarks.js';

export async function sendMessage() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    if (!text) return;
    const { error } = await sb.from('messages').insert({
        room_id: currentRoom,
        sender_id: currentUser.id,
        text: text,
        created_at: new Date().toISOString()
    });
    if (error) console.error('Send error:', error);
    else input.value = '';
}

export async function loadMessages() {
    const { data: messages, error } = await sb
        .from('messages')
        .select('*, profiles(full_name, email)')
        .eq('room_id', currentRoom)
        .order('created_at', { ascending: true });
    if (error) { console.error(error); return; }
    renderMessages(messages);
}

function renderMessages(messages) {
    const container = document.getElementById('messagesContainer');
    if (!container) return;
    if (!messages || messages.length === 0) {
        container.innerHTML = '<div class="text-gray-500 text-center">No messages yet. Say hello!</div>';
        return;
    }
    container.innerHTML = messages.map(msg => {
        const senderName = msg.profiles?.full_name || msg.profiles?.email || 'Unknown';
        const isOwn = msg.sender_id === currentUser.id;
        return `
            <div class="flex ${isOwn ? 'justify-end' : 'justify-start'} group">
                <div class="max-w-xs ${isOwn ? 'bg-green-100' : 'bg-white'} rounded-lg p-2 shadow relative">
                    <div class="text-xs text-gray-500">${senderName}</div>
                    <div class="text-sm">${escapeHtml(msg.text)}</div>
                    <div class="text-xs text-gray-400 text-right">${new Date(msg.created_at).toLocaleTimeString()}</div>
                    <div class="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                        <button class="schedule-btn text-gray-400 hover:text-blue-500" data-message-text="${escapeHtml(msg.text)}">📅</button>
                        <button class="bookmark-btn text-gray-400 hover:text-yellow-500" data-message-id="${msg.id}" data-message-text="${escapeHtml(msg.text)}">⭐</button>
                        <button class="reminder-btn text-gray-400 hover:text-yellow-600" data-message-id="${msg.id}" data-message-text="${escapeHtml(msg.text)}">🔔</button>
                        <button class="task-convert-btn text-gray-400 hover:text-green-600" data-message-id="${msg.id}" data-message-text="${escapeHtml(msg.text)}">📋</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    container.scrollTop = container.scrollHeight;
    attachMessageButtonListeners();
}

function attachMessageButtonListeners() {
    document.querySelectorAll('.task-convert-btn').forEach(btn => {
        btn.removeEventListener('click', handleTaskConvert);
        btn.addEventListener('click', handleTaskConvert);
    });
    document.querySelectorAll('.reminder-btn').forEach(btn => {
        btn.removeEventListener('click', handleReminder);
        btn.addEventListener('click', handleReminder);
    });
    document.querySelectorAll('.bookmark-btn').forEach(btn => {
        btn.removeEventListener('click', handleBookmark);
        btn.addEventListener('click', handleBookmark);
    });
    document.querySelectorAll('.schedule-btn').forEach(btn => {
        btn.removeEventListener('click', handleSchedule);
        btn.addEventListener('click', handleSchedule);
    });
}

function handleTaskConvert(e) {
    e.stopPropagation();
    const btn = e.currentTarget;
    openTaskModal(btn.getAttribute('data-message-id'), btn.getAttribute('data-message-text'));
}
function handleReminder(e) {
    e.stopPropagation();
    const btn = e.currentTarget;
    showReminderModal(btn.getAttribute('data-message-id'), btn.getAttribute('data-message-text'));
}
async function handleBookmark(e) {
    e.stopPropagation();
    const btn = e.currentTarget;
    const messageId = btn.getAttribute('data-message-id');
    const messageText = btn.getAttribute('data-message-text');
    await toggleBookmark(messageId, messageText, btn);
}
function handleSchedule(e) {
    e.stopPropagation();
    const btn = e.currentTarget;
    const messageText = btn.getAttribute('data-message-text');
    showScheduleModal(messageText);
}

export function subscribeToMessages() {
    if (messageSubscription) messageSubscription.unsubscribe();
    const sub = sb
        .channel('public:messages')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
            if (payload.new.room_id === currentRoom) {
                sb.from('profiles').select('full_name, email').eq('id', payload.new.sender_id).then(({ data }) => {
                    const newMsg = { ...payload.new, profiles: data?.[0] || null };
                    const container = document.getElementById('messagesContainer');
                    if (!container) return;
                    const isOwn = newMsg.sender_id === currentUser.id;
                    const msgHtml = `
                        <div class="flex ${isOwn ? 'justify-end' : 'justify-start'} group">
                            <div class="max-w-xs ${isOwn ? 'bg-green-100' : 'bg-white'} rounded-lg p-2 shadow relative">
                                <div class="text-xs text-gray-500">${newMsg.profiles?.full_name || newMsg.profiles?.email || 'Unknown'}</div>
                                <div class="text-sm">${escapeHtml(newMsg.text)}</div>
                                <div class="text-xs text-gray-400 text-right">${new Date(newMsg.created_at).toLocaleTimeString()}</div>
                                <div class="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                                    <button class="schedule-btn text-gray-400 hover:text-blue-500" data-message-text="${escapeHtml(newMsg.text)}">📅</button>
                                    <button class="bookmark-btn text-gray-400 hover:text-yellow-500" data-message-id="${newMsg.id}" data-message-text="${escapeHtml(newMsg.text)}">⭐</button>
                                    <button class="reminder-btn text-gray-400 hover:text-yellow-600" data-message-id="${newMsg.id}" data-message-text="${escapeHtml(newMsg.text)}">🔔</button>
                                    <button class="task-convert-btn text-gray-400 hover:text-green-600" data-message-id="${newMsg.id}" data-message-text="${escapeHtml(newMsg.text)}">📋</button>
                                </div>
                            </div>
                        </div>
                    `;
                    container.insertAdjacentHTML('beforeend', msgHtml);
                    container.scrollTop = container.scrollHeight;
                    attachMessageButtonListeners();
                });
            }
        })
        .subscribe();
    setMessageSubscription(sub);
}