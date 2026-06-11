import { sb } from './shared.js';

window.sendMessage = async function() {
    let text = window.quillEditor.root.innerHTML.trim();
    text = text.replace(/^(<p><br><\/p>)+|(<p><br><\/p>)+$/g, '');
    if (!text) return;
    
    const sendBtn = document.getElementById('sendBtn');
    if(sendBtn) sendBtn.innerHTML = '<i class="ti ti-loader fa-spin text-lg"></i>';

    let payload = { room_id: window.currentRoom, sender_id: window.currentUser.id, text, created_at: new Date().toISOString() };
    if (window.currentlyReplyingTo) {
        payload.parent_message_id = window.currentlyReplyingTo;
        window.pendingScrollId = window.currentlyReplyingTo;
    } else {
        window.pendingScrollId = 'BOTTOM';
    }
    
    await sb.from('messages').insert(payload);
    window.quillEditor.root.innerHTML = '';
    window.cancelReply();
    if(sendBtn) sendBtn.innerHTML = '<i class="ti ti-send text-lg"></i>';
};

window.loadMessages = async function() {
    const {data: msgs} = await sb.from('messages').select('*, profiles(full_name, email)').eq('room_id', window.currentRoom).order('created_at', {ascending: true});
    
    const {data: bms} = await sb.from('bookmarks').select('message_id').eq('user_id', window.currentUser.id);
    window.bookmarkedSet = new Set(bms?.map(b => b.message_id) || []);

    const c = document.getElementById('messagesContainer');
    const isNearBottom = c ? (c.scrollHeight - c.scrollTop - c.clientHeight < 150) : false;

    window.renderMessages(msgs || []);
    if (typeof window.applyFilters === 'function') window.applyFilters();
    
    if(c) {
        setTimeout(() => { 
            if (window.pendingScrollId && window.pendingScrollId !== 'BOTTOM') {
                const row = document.getElementById(`row-${window.pendingScrollId}`);
                if (row) {
                    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    const bubble = row.querySelector('.bubble');
                    if(bubble) {
                        bubble.classList.add('glow-target');
                        setTimeout(() => { bubble.classList.add('active-glow'); }, 50);
                        setTimeout(() => { bubble.classList.remove('glow-target', 'active-glow'); }, 3500);
                    }
                }
                window.pendingScrollId = null;
            } else if (window.pendingScrollId === 'BOTTOM') {
                c.scrollTop = c.scrollHeight;
                window.pendingScrollId = null;
            } else if (isNearBottom) {
                c.scrollTop = c.scrollHeight; 
            }
        }, 100); 
    }
};

window.renderMessages = function(messages) {
    const c = document.getElementById('chatShellContainer');
    if (!c) return;
    if (!messages.length) { c.innerHTML = '<div class="m-auto flex flex-col items-center opacity-50 pt-10"><i class="ti ti-messages text-5xl mb-3 text-gray-300"></i><p class="font-medium text-gray-500">Say hello!</p></div>'; return; }
    
    window.bookmarkedSet = window.bookmarkedSet || new Set();

    const msgMap = new Map();
    messages.forEach(m => msgMap.set(m.id, m));
    const topLevel = [];
    const replies = {};
    
    messages.forEach(msg => {
        if (msg.parent_message_id) {
            let rootId = msg.parent_message_id;
            const visited = new Set();
            while (msgMap.has(rootId) && msgMap.get(rootId).parent_message_id) {
                if(visited.has(rootId)) break;
                visited.add(rootId);
                rootId = msgMap.get(rootId).parent_message_id;
            }
            if (!replies[rootId]) replies[rootId] = [];
            replies[rootId].push(msg);
        } else {
            topLevel.push(msg);
        }
    });

    function buildMsgHTML(msg) {
        const isSent = msg.sender_id === window.currentUser.id;
        const senderName = isSent ? 'You' : window.toSentenceCase(msg.profiles?.full_name || msg.profiles?.email.split('@')[0] || 'Unknown');
        const time = window.getISTTime(msg.created_at);
        const snippetText = window.getSnippet(msg.text);
        
        let displayHtml = msg.text.replace(/href="https:\/\/secure-file\.local\/([^"]+)"/g, `href="javascript:void(0);" onclick="window.openSecureFile('$1'); return false;" class="text-blue-600 underline font-medium hover:text-blue-800 transition-colors"`);

        const rowClass = isSent ? 'row-sent' : 'row-rcvd';
        const bubbleClass = isSent ? 'bubble sent' : 'bubble rcvd';
        const avClass = isSent ? 'b-avatar sent-av' : 'b-avatar rcvd-av';
        const avatarInitial = senderName.charAt(0).toUpperCase();
        const roleStr = isSent ? 'Teacher' : 'Teacher'; 
        const tickHTML = isSent ? `<span class="b-tick">✓✓</span>` : '';
        const replyCount = replies[msg.id] ? replies[msg.id].length : 0;
        const isBookmarked = window.bookmarkedSet.has(msg.id);

        const ddItems = isSent
            ? `<button class="dd-item" onclick="window.closeDropdowns(); window.openTaskModal('${msg.id}', '${window.escapeHtml(msg.text)}')"><i class="ti ti-clipboard-check"></i>Create Task</button>
               <button class="dd-item" onclick="window.closeDropdowns(); window.showReminderModal('${msg.id}', '${snippetText}')"><i class="ti ti-bell"></i>Reminder</button>
               <button class="dd-item danger" onclick="window.closeDropdowns()"><i class="ti ti-trash"></i>Delete</button>`
            : `<button class="dd-item" onclick="window.closeDropdowns(); window.openTaskModal('${msg.id}', '${window.escapeHtml(msg.text)}')"><i class="ti ti-clipboard-check"></i>Create Task</button>
               <button class="dd-item" onclick="window.closeDropdowns(); window.showReminderModal('${msg.id}', '${snippetText}')"><i class="ti ti-bell"></i>Reminder</button>`;

        let repliesHTML = '';
        if (replyCount > 0) {
            repliesHTML = `
            <div class="b-divider"></div>
            <div class="replies-wrap" id="rw-${msg.id}" style="display:flex; flex-direction:column; gap:2px;">
              <div class="replies-label"><i class="ti ti-git-branch"></i>Replies</div>
              ${replies[msg.id].map((r, idx) => {
                  const rName = window.toSentenceCase(r.profiles?.full_name || r.profiles?.email.split('@')[0] || 'Unknown');
                  const rTime = window.getISTTime(r.created_at);
                  const rDisplayHtml = r.text.replace(/href="https:\/\/secure-file\.local\/([^"]+)"/g, `href="javascript:void(0);" onclick="window.openSecureFile('$1'); return false;" class="text-blue-600 underline font-medium"`);
                  return `
                  <div class="reply-item">
                    <div class="reply-num">${idx + 1}</div>
                    <div class="reply-body">
                      <div class="reply-meta">
                        <span class="reply-name">${window.escapeHtml(rName)}</span>
                        <span class="reply-role">Teacher</span>
                        <span class="reply-time">${rTime}</span>
                      </div>
                      <div class="reply-text">${rDisplayHtml}</div>
                    </div>
                  </div>`;
              }).join('')}
            </div>`;
        }

        return `
        <div class="${rowClass} transition-colors" id="row-${msg.id}">
          <div class="${bubbleClass}">
            <div class="b-header">
              <div class="${avClass}">${avatarInitial}</div>
              <div class="b-name">${window.escapeHtml(senderName)} <span class="b-role">· ${roleStr}</span></div>
              <span class="b-time">${time} ${tickHTML}</span>
              <div class="menu-wrap">
                <button class="dot-btn" onclick="window.toggleDropdown('dd-${msg.id}')" aria-label="Options"><i class="ti ti-dots-vertical"></i></button>
                <div class="bubble-dropdown" id="dd-${msg.id}">${ddItems}</div>
              </div>
            </div>
            
            <div class="b-text">${displayHtml}</div>
            
            <div class="b-footer">
              <div class="relative inline-block group/reaction z-50">
                  <button class="e-add" title="Add reaction"><i class="ti ti-mood-smile"></i></button>
                  <div class="absolute bottom-full ${isSent ? 'right-0' : 'left-0'} pb-1.5 hidden group-hover/reaction:block cursor-default z-[100]">
                      <div class="bg-white border border-gray-200 shadow-2xl rounded-xl p-3 min-w-[280px] flex flex-col">
                          
                          <div class="text-[10px] font-bold text-gray-400 mb-1 uppercase tracking-wider">Reactions</div>
                          <div class="flex flex-wrap gap-1 border-b border-gray-100 pb-2 mb-2">
                              <span class="cursor-pointer hover:bg-gray-100 p-1.5 rounded-lg text-lg transition-transform hover:scale-125" onclick="window.applyReaction('${msg.id}', '👍', 'emoji')">👍</span>
                              <span class="cursor-pointer hover:bg-gray-100 p-1.5 rounded-lg text-lg transition-transform hover:scale-125" onclick="window.applyReaction('${msg.id}', '❤️', 'emoji')">❤️</span>
                              <span class="cursor-pointer hover:bg-gray-100 p-1.5 rounded-lg text-lg transition-transform hover:scale-125" onclick="window.applyReaction('${msg.id}', '😂', 'emoji')">😂</span>
                              <span class="cursor-pointer hover:bg-gray-100 p-1.5 rounded-lg text-lg transition-transform hover:scale-125" onclick="window.applyReaction('${msg.id}', '😮', 'emoji')">😮</span>
                              <span class="cursor-pointer hover:bg-gray-100 p-1.5 rounded-lg text-lg transition-transform hover:scale-125" onclick="window.applyReaction('${msg.id}', '😢', 'emoji')">😢</span>
                              <span class="cursor-pointer hover:bg-gray-100 p-1.5 rounded-lg text-lg transition-transform hover:scale-125" onclick="window.applyReaction('${msg.id}', '🙏', 'emoji')">🙏</span>
                              <span class="cursor-pointer hover:bg-gray-100 p-1.5 rounded-lg text-lg transition-transform hover:scale-125" onclick="window.applyReaction('${msg.id}', '🎉', 'emoji')">🎉</span>
                              <span class="cursor-pointer hover:bg-gray-100 p-1.5 rounded-lg text-lg transition-transform hover:scale-125" onclick="window.applyReaction('${msg.id}', '🔥', 'emoji')">🔥</span>
                          </div>
                          
                          <div class="text-[10px] font-bold text-gray-400 mb-1 uppercase tracking-wider">Quick Tags</div>
                          <div class="flex flex-wrap gap-2">
                              <span class="cursor-pointer bg-green-50 hover:bg-green-100 text-green-700 px-3 py-1 rounded-md text-[11px] font-bold border border-green-200 shadow-sm" onclick="window.applyReaction('${msg.id}', 'Thank You', 'tag')">Thank You</span>
                              <span class="cursor-pointer bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-1 rounded-md text-[11px] font-bold border border-blue-200 shadow-sm" onclick="window.applyReaction('${msg.id}', 'Noted', 'tag')">Noted</span>
                              <span class="cursor-pointer bg-purple-50 hover:bg-purple-100 text-purple-700 px-3 py-1 rounded-md text-[11px] font-bold border border-purple-200 shadow-sm" onclick="window.applyReaction('${msg.id}', 'Copied', 'tag')">Copied</span>
                              <span class="cursor-pointer bg-orange-50 hover:bg-orange-100 text-orange-700 px-3 py-1 rounded-md text-[11px] font-bold border border-orange-200 shadow-sm" onclick="window.applyReaction('${msg.id}', 'Yes Sir', 'tag')">Yes Sir</span>
                              <span class="cursor-pointer bg-pink-50 hover:bg-pink-100 text-pink-700 px-3 py-1 rounded-md text-[11px] font-bold border border-pink-200 shadow-sm" onclick="window.applyReaction('${msg.id}', 'Yes Madam', 'tag')">Yes Madam</span>
                          </div>
                      </div>
                  </div>
              </div>
            </div>
            
            <div class="b-actions">
              ${replyCount > 0 ? `<button class="act-btn" onclick="window.toggleReplies('rw-${msg.id}')"><i class="ti ti-message-2"></i> Replies <span class="reply-badge">${replyCount}</span></button>` : ''}
              <button class="act-btn" onclick="window.initiateReply('${msg.id}', '${snippetText}')"><i class="ti ti-corner-up-left"></i> Reply</button>
              <button class="act-btn ${isBookmarked ? 'bookmarked' : ''}" onclick="window.toggleBookmark('${msg.id}')"><i class="ti ${isBookmarked ? 'ti-bookmark-filled' : 'ti-bookmark'}"></i> ${isBookmarked ? 'Bookmarked' : 'Bookmark'}</button>
            </div>
            
            ${repliesHTML}
          </div>
        </div>`;
    }

    const dateLabel = `<div class="day-label">Today — ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric'})}</div>`;
    c.innerHTML = dateLabel + topLevel.map(msg => buildMsgHTML(msg)).join('');
};

window.applyReaction = async function(msgId, value, type) {
    const row = document.getElementById(`row-${msgId}`);
    if (!row) return;
    const footer = row.querySelector('.b-footer');
    if (!footer) return;

    if (type === 'emoji') {
        const chipHtml = `<button class="e-chip active">${value} <span class="e-cnt">1</span></button>`;
        const reactionMenu = footer.querySelector('.group\\/reaction');
        reactionMenu.insertAdjacentHTML('beforebegin', chipHtml);
    } else {
        let colorClass = 'bg-blue-50 text-blue-700 border-blue-200';
        if(value === 'Thank You') colorClass = 'bg-green-50 text-green-700 border-green-200';
        if(value === 'Noted') colorClass = 'bg-blue-50 text-blue-700 border-blue-200';
        if(value === 'Copied') colorClass = 'bg-purple-50 text-purple-700 border-purple-200';
        if(value === 'Yes Sir') colorClass = 'bg-orange-50 text-orange-700 border-orange-200';
        if(value === 'Yes Madam') colorClass = 'bg-pink-50 text-pink-700 border-pink-200';
        
        const tagHtml = `<span class="${colorClass} px-2 py-0.5 rounded text-[10px] font-bold border shadow-sm ml-1">${value}</span>`;
        footer.insertAdjacentHTML('beforeend', tagHtml);
    }

    const hoverMenu = row.querySelector('.group\\/reaction .absolute');
    if (hoverMenu) {
        hoverMenu.style.display = 'none';
        setTimeout(() => { hoverMenu.style.display = ''; }, 300);
    }
};

window.toggleReplies = function(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = el.style.display === 'none' ? 'flex' : 'none';
};

window.initiateReply = function(parentId, text) {
    window.currentlyReplyingTo = parentId;
    const banner = document.getElementById('replyBanner');
    const bannerText = document.getElementById('replyBannerText');
    banner.classList.remove('hidden');
    bannerText.innerText = text;
    window.quillEditor.focus();
};

window.cancelReply = function() {
    window.currentlyReplyingTo = null;
    const banner = document.getElementById('replyBanner');
    if(banner) banner.classList.add('hidden');
};

window.toggleBookmark = async function(mid) { 
    if (typeof window.closeDropdowns === 'function') window.closeDropdowns();
    const btn = document.querySelector(`#row-${mid} .act-btn[onclick*="toggleBookmark"]`);
    let isCurrentlyBookmarked = window.bookmarkedSet && window.bookmarkedSet.has(mid);
    
    if (isCurrentlyBookmarked) {
        window.bookmarkedSet.delete(mid);
        if (btn) { btn.classList.remove('bookmarked'); btn.innerHTML = '<i class="ti ti-bookmark"></i> Bookmark'; }
        window.showCenterToast('Bookmark removed', 'fa-solid fa-info-circle', 'text-yellow-400');
        await sb.from('bookmarks').delete().eq('user_id', window.currentUser.id).eq('message_id', mid);
    } else {
        window.bookmarkedSet = window.bookmarkedSet || new Set();
        window.bookmarkedSet.add(mid);
        if (btn) { btn.classList.add('bookmarked'); btn.innerHTML = '<i class="ti ti-bookmark-filled"></i> Bookmarked'; }
        window.showCenterToast('Message Bookmarked');
        await sb.from('bookmarks').insert({ user_id: window.currentUser.id, message_id: mid });
    } 
};

window.applyFilters = function() {
    const searchBar = document.getElementById('messageSearchBar');
    if (!searchBar) return;
    const search = searchBar.value.toLowerCase();
    document.querySelectorAll('.row-sent, .row-rcvd').forEach(el => {
        let show = true;
        const text = el.innerText.toLowerCase();
        if (search && !text.includes(search)) show = false;
        el.style.display = show ? 'flex' : 'none';
    });
};

window.insertEmoji = function(char) {
    if (!window.quillEditor) return;
    window.quillEditor.focus();
    const range = window.quillEditor.getSelection();
    const index = range ? range.index : window.quillEditor.getLength();
    window.quillEditor.insertText(index, char);
    window.quillEditor.setSelection(index + char.length); 
    const ep = document.getElementById('inputEmojiPicker');
    if(ep) ep.classList.add('hidden');
};

window.toggleInputEmojiPicker = function() {
    const ep = document.getElementById('inputEmojiPicker');
    if(ep) ep.classList.toggle('hidden');
};

window.cancelFileRename = function() {
    window.pendingFileUpload = null;
    const fileInput = document.getElementById('fileAttachment');
    if (fileInput) fileInput.value = '';
    const modal = document.getElementById('fileRenameModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
};

window.confirmFileRename = async function() {
    if (!window.pendingFileUpload) return;
    const file = window.pendingFileUpload;
    window.pendingFileUpload = null;
    
    const modal = document.getElementById('fileRenameModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }

    const lastDot = file.name.lastIndexOf('.');
    const ext = lastDot !== -1 ? file.name.substring(lastDot) : '';
    
    let newNameInput = document.getElementById('newFileNameInput');
    let newName = newNameInput ? newNameInput.value.trim() : '';
    if (!newName) newName = lastDot !== -1 ? file.name.substring(0, lastDot) : file.name;
    const finalName = newName + ext;
    
    if (typeof window.showCenterToast === 'function') window.showCenterToast('Uploading secure file...', 'fa-solid fa-spinner fa-spin', 'text-blue-500');
    
    const sizeKB = Math.round(file.size / 1024);
    const safeName = finalName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const filePath = `chat/${Date.now()}_${safeName}`;
    
    const { error } = await sb.storage.from('task-proofs').upload(filePath, file);
    if(error) { 
        if (typeof window.showCenterToast === 'function') window.showCenterToast('Upload failed: ' + error.message, 'fa-solid fa-times', 'text-red-500'); 
        return; 
    }
    
    if (window.quillEditor) {
        window.quillEditor.focus();
        const range = window.quillEditor.getSelection();
        const index = range ? range.index : window.quillEditor.getLength();
        window.quillEditor.insertText(index, `📁 Attached File: ${finalName} (${sizeKB} KB)\n`, 'link', `https://secure-file.local/${filePath}`);
    }
    
    if (typeof window.showCenterToast === 'function') window.showCenterToast('File securely attached!', 'fa-solid fa-check-circle', 'text-green-500');
    const fileInput = document.getElementById('fileAttachment');
    if (fileInput) fileInput.value = ''; 
};
