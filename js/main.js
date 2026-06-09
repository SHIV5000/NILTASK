import { sb } from './config.js';
import { currentUser, currentRoom, setCurrentUser, setCurrentRoom } from './state.js';
import { signIn, signUp, logout, refreshProfile } from './auth.js';
import { loadMessages, sendMessage, subscribeToMessages } from './chat.js';
import { loadTasks, subscribeToTasks, subscribeToAssignees, subscribeToTrails } from './tasks.js';
import { loadBookmarks, subscribeToBookmarks } from './bookmarks.js';
import { subscribeToNotifications } from './notifications.js';
import { closeTaskModal, saveTaskMultiAssignee } from './tasks.js';
import { closeReminderModal, saveReminder } from './reminders.js';
import { closeScheduleModal, saveScheduledMessage } from './scheduled.js';

let renderInProgress = false;

export function setCurrentRoomAndRefresh(room) {
    setCurrentRoom(room);
    renderMainUI();
}

function renderAuth() {
    const root = document.getElementById('root');
    root.innerHTML = `
        <div class="max-w-md mx-auto bg-white p-6 rounded shadow mt-10">
            <h1 class="text-2xl font-bold text-green-600 mb-4">MPGS TaskFlow</h1>
            <input type="email" id="email" placeholder="Email" class="border p-2 w-full mb-2 rounded">
            <input type="password" id="password" placeholder="Password" class="border p-2 w-full mb-2 rounded">
            <div class="flex gap-2">
                <button id="loginBtn" class="bg-green-600 text-white p-2 rounded flex-1">Login</button>
                <button id="signupBtn" class="bg-blue-600 text-white p-2 rounded flex-1">Sign Up</button>
            </div>
            <div id="authMsg" class="mt-4 text-sm text-red-500"></div>
        </div>
    `;
    document.getElementById('loginBtn').onclick = async () => {
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const { error } = await signIn(email, password);
        if (error) document.getElementById('authMsg').innerText = error.message;
        else {
            await refreshProfile();
            renderMainUI();
            subscribeToMessages();
            subscribeToTasks();
            subscribeToAssignees();
            subscribeToTrails();
            subscribeToNotifications();
            subscribeToBookmarks();
        }
    };
    document.getElementById('signupBtn').onclick = async () => {
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const { error } = await signUp(email, password);
        if (error) document.getElementById('authMsg').innerText = error.message;
        else document.getElementById('authMsg').innerText = 'Check email for confirmation!';
    };
}

export function renderMainUI() {
    if (renderInProgress) return;
    renderInProgress = true;
    const root = document.getElementById('root');
    root.innerHTML = `
        <div class="flex h-screen max-h-screen">
            <!-- Left: Task + Bookmark Sidebar -->
            <div class="w-80 bg-white border-r flex flex-col overflow-y-auto">
                <div class="p-4 border-b">
                    <h2 class="font-bold text-lg">My Tasks</h2>
                </div>
                <div id="tasksList" class="flex-1 overflow-y-auto p-2 space-y-2">
                    Loading tasks...
                </div>
                <div class="border-t mt-4 pt-4 p-4">
                    <h2 class="font-bold text-lg mb-2">📌 Bookmarks</h2>
                    <div id="bookmarksList" class="space-y-2 max-h-48 overflow-y-auto">
                        Loading bookmarks...
                    </div>
                </div>
            </div>
            <!-- Middle: Channels -->
            <div class="w-64 bg-white border-r flex flex-col">
                <h2 class="font-bold p-4 border-b">Channels</h2>
                <div id="channelList" class="flex-1 p-2">
                    <div class="channel-item p-2 rounded cursor-pointer hover:bg-gray-100" data-room="general"># general</div>
                    <div class="channel-item p-2 rounded cursor-pointer hover:bg-gray-100" data-room="math"># math</div>
                    <div class="channel-item p-2 rounded cursor-pointer hover:bg-gray-100" data-room="science"># science</div>
                </div>
                <div class="p-4 border-t">
                    <button id="logoutBtn" class="text-red-500 text-sm">Logout</button>
                </div>
            </div>
            <!-- Right: Chat -->
            <div class="flex-1 flex flex-col">
                <div class="bg-white border-b p-4">
                    <h2 class="text-xl font-semibold"># ${currentRoom}</h2>
                </div>
                <div id="messagesContainer" class="flex-1 overflow-y-auto p-4 space-y-2"></div>
                <div class="bg-white border-t p-4">
                    <div class="flex gap-2">
                        <input type="text" id="messageInput" placeholder="Type a message..." class="flex-1 border rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-green-500">
                        <button id="sendBtn" class="bg-green-600 text-white px-4 py-2 rounded-full">Send</button>
                    </div>
                </div>
            </div>
        </div>
        <!-- Task Modal -->
        <div id="taskModal" class="fixed inset-0 bg-gray-600 bg-opacity-50 hidden items-center justify-center z-50">
            <div class="bg-white rounded-lg p-6 w-96">
                <h3 class="text-lg font-bold mb-4">Convert to Task</h3>
                <input type="text" id="taskTitle" placeholder="Task title" class="border p-2 w-full mb-2 rounded">
                <select id="taskAssignees" multiple size="4" class="border p-2 w-full mb-2 rounded"></select>
                <input type="date" id="taskDeadline" class="border p-2 w-full mb-2 rounded">
                <select id="taskPriority" class="border p-2 w-full mb-2 rounded">
                    <option value="low">Low</option>
                    <option value="medium" selected>Medium</option>
                    <option value="high">High</option>
                </select>
                <label class="flex items-center mb-4">
                    <input type="checkbox" id="taskRequireProof" class="mr-2"> Require proof
                </label>
                <div class="flex justify-end gap-2">
                    <button id="cancelTaskBtn" class="px-4 py-2 bg-gray-300 rounded">Cancel</button>
                    <button id="saveTaskBtn" class="px-4 py-2 bg-green-600 text-white rounded">Create Task</button>
                </div>
            </div>
        </div>
        <!-- Reminder Modal -->
        <div id="reminderModal" class="fixed inset-0 bg-gray-600 bg-opacity-50 hidden items-center justify-center z-50">
            <div class="bg-white rounded-lg p-6 w-96">
                <h3 class="text-lg font-bold mb-4">Set Reminder</h3>
                <p class="text-sm text-gray-600 mb-2" id="reminderMessagePreview"></p>
                <input type="datetime-local" id="reminderDateTime" class="border p-2 w-full mb-4 rounded">
                <div class="flex justify-end gap-2">
                    <button id="cancelReminderBtn" class="px-4 py-2 bg-gray-300 rounded">Cancel</button>
                    <button id="saveReminderBtn" class="px-4 py-2 bg-green-600 text-white rounded">Set Reminder</button>
                </div>
            </div>
        </div>
        <!-- Scheduled Message Modal -->
        <div id="scheduleModal" class="fixed inset-0 bg-gray-600 bg-opacity-50 hidden items-center justify-center z-50">
            <div class="bg-white rounded-lg p-6 w-96">
                <h3 class="text-lg font-bold mb-4">Schedule Message</h3>
                <textarea id="scheduleMessageText" rows="3" placeholder="Message to send later..." class="border p-2 w-full mb-2 rounded"></textarea>
                <select id="scheduleChannel" class="border p-2 w-full mb-2 rounded">
                    <option value="general"># general</option>
                    <option value="math"># math</option>
                    <option value="science"># science</option>
                </select>
                <input type="datetime-local" id="scheduleDateTime" class="border p-2 w-full mb-4 rounded">
                <div class="flex justify-end gap-2">
                    <button id="cancelScheduleBtn" class="px-4 py-2 bg-gray-300 rounded">Cancel</button>
                    <button id="saveScheduleBtn" class="px-4 py-2 bg-blue-600 text-white rounded">Schedule</button>
                </div>
            </div>
        </div>
    `;

    // Channel switching
    document.querySelectorAll('.channel-item').forEach(el => {
        el.addEventListener('click', () => {
            setCurrentRoom(el.getAttribute('data-room'));
            renderMainUI();
        });
    });
    document.getElementById('logoutBtn').onclick = async () => {
        await logout();
        // unsubscribe all (handled in state, but we can just reload)
        window.location.reload();
    };
    document.getElementById('sendBtn').onclick = sendMessage;
    document.getElementById('messageInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
    document.getElementById('cancelTaskBtn').onclick = closeTaskModal;
    document.getElementById('saveTaskBtn').onclick = saveTaskMultiAssignee;
    document.getElementById('cancelReminderBtn').onclick = closeReminderModal;
    document.getElementById('saveReminderBtn').onclick = saveReminder;
    document.getElementById('cancelScheduleBtn').onclick = closeScheduleModal;
    document.getElementById('saveScheduleBtn').onclick = saveScheduledMessage;

    loadMessages();
    loadTasks();
    loadBookmarks();
    renderInProgress = false;
}

async function start() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
        renderAuth();
        return;
    }
    setCurrentUser(session.user);
    await refreshProfile();
    renderMainUI();
    subscribeToMessages();
    subscribeToTasks();
    subscribeToAssignees();
    subscribeToTrails();
    subscribeToNotifications();
    subscribeToBookmarks();
}

// Expose for bookmark view switching
window.setCurrentRoomAndRefresh = setCurrentRoomAndRefresh;

start();