// NILTASK task trail renderer v207
/**
 * ─────────────────────────────────────────────────────────────────────────
 * PROFESSIONAL TASK TRAIL RENDERER (js/task-trail-renderer.js)
 * ─────────────────────────────────────────────────────────────────────────
 * 
 * Enterprise-grade audit trail visualization with:
 * - Timeline-style layout with visual chronological flow
 * - Color-coded action types for quick scanning
 * - User avatars and designation display
 * - Rich file previews and metadata
 * - Responsive mobile/desktop rendering
 * - Accessibility compliance (WCAG 2.1 AA)
 */

/**
 * Action type metadata: icon, color, label, severity
 */
const TRAIL_ACTION_CONFIG = {
    'UPDATE': {
        icon: 'fa-pen-to-square',
        bgColor: '#dbeafe',      // blue-100
        borderColor: '#3b82f6',   // blue-500
        textColor: '#1e40af',     // blue-800
        severity: 'info',
        label: 'Update'
    },
    'FILE': {
        icon: 'fa-file-arrow-up',
        bgColor: '#dcfce7',       // green-100
        borderColor: '#22c55e',   // green-500
        textColor: '#166534',     // green-800
        severity: 'success',
        label: 'File Attached'
    },
    'ACKNOWLEDGE': {
        icon: 'fa-check-circle',
        bgColor: '#fef3c7',       // amber-100
        borderColor: '#f59e0b',   // amber-500
        textColor: '#92400e',     // amber-800
        severity: 'warning',
        label: 'Acknowledged'
    },
    'SUBMIT': {
        icon: 'fa-paper-plane',
        bgColor: '#e0e7ff',       // indigo-100
        borderColor: '#6366f1',   // indigo-500
        textColor: '#312e81',     // indigo-800
        severity: 'info',
        label: 'Submitted'
    },
    'REVIEW': {
        icon: 'fa-magnifying-glass',
        bgColor: '#fecaca',       // red-100
        borderColor: '#ef4444',   // red-500
        textColor: '#7f1d1d',     // red-800
        severity: 'warning',
        label: 'Under Review'
    },
    'ACCEPT': {
        icon: 'fa-circle-check',
        bgColor: '#bbf7d0',       // green-200
        borderColor: '#10b981',   // emerald-500
        textColor: '#065f46',     // emerald-800
        severity: 'success',
        label: 'Accepted'
    },
    'REJECT': {
        icon: 'fa-circle-xmark',
        bgColor: '#fee2e2',       // red-100
        borderColor: '#dc2626',   // red-600
        textColor: '#7f1d1d',     // red-800
        severity: 'error',
        label: 'Rejected'
    },
    'DELEGATE': {
        icon: 'fa-person-arrow-down-to-line',
        bgColor: '#f3e8ff',       // purple-100
        borderColor: '#a855f7',   // purple-500
        textColor: '#5b21b6',     // purple-800
        severity: 'info',
        label: 'Delegated'
    },
    'TRANSFER': {
        icon: 'fa-arrow-right-arrow-left',
        bgColor: '#fae8ff',       // fuchsia-100
        borderColor: '#ec4899',   // pink-500
        textColor: '#831843',     // pink-800
        severity: 'warning',
        label: 'Transferred'
    },
    'REMINDER': {
        icon: 'fa-bell',
        bgColor: '#fff7ed',
        borderColor: '#f97316',
        textColor: '#9a3412',
        severity: 'warning',
        label: 'Reminder Sent'
    },
    'DEADLINE': {
        icon: 'fa-calendar-check',
        bgColor: '#e0f2fe',
        borderColor: '#0284c7',
        textColor: '#075985',
        severity: 'info',
        label: 'Deadline Changed'
    },
    'EXTENSION_REQUEST': {
        icon: 'fa-calendar-plus',
        bgColor: '#fef3c7',
        borderColor: '#d97706',
        textColor: '#92400e',
        severity: 'warning',
        label: 'Extension Requested'
    },
    'EXTENSION_APPROVED': {
        icon: 'fa-calendar-check',
        bgColor: '#dcfce7',
        borderColor: '#16a34a',
        textColor: '#166534',
        severity: 'success',
        label: 'Extension Approved'
    },
    'EXTENSION_REJECTED': {
        icon: 'fa-calendar-xmark',
        bgColor: '#fee2e2',
        borderColor: '#dc2626',
        textColor: '#991b1b',
        severity: 'error',
        label: 'Extension Declined'
    },
    'CANCEL': {
        icon: 'fa-ban',
        bgColor: '#f1f5f9',
        borderColor: '#64748b',
        textColor: '#334155',
        severity: 'error',
        label: 'Task Cancelled'
    }
};

/**
 * Get initials for user avatar fallback
 */
function _getInitials(fullName, email) {
    const name = (fullName || email || 'System').split('@')[0];
    return name
        .split(/\s+/)
        .slice(0, 2)
        .map(w => w[0].toUpperCase())
        .join('')
        .substring(0, 2) || '?';
}

/**
 * Determine action type from trail entry
 */
function _detectActionType(trail) {
    if (TRAIL_ACTION_CONFIG[trail.action]) return trail.action;
    if (trail.action === 'FILE') return 'FILE';
    if (trail.comment?.includes('Acknowledged')) return 'ACKNOWLEDGE';
    if (trail.comment?.includes('Submitted')) return 'SUBMIT';
    if (trail.comment?.includes('Review')) return 'REVIEW';
    if (trail.comment?.includes('Accepted')) return 'ACCEPT';
    if (trail.comment?.includes('Rejected')) return 'REJECT';
    if (trail.comment?.includes('Delegated')) return 'DELEGATE';
    if (trail.comment?.includes('Transferred')) return 'TRANSFER';
    return 'UPDATE';
}

/**
 * Format time in IST with AM/PM
 */
function _formatTrailTime(timestamp) {
    try {
        const d = new Date(timestamp);
        return d.toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        });
    } catch {
        return '—';
    }
}

/**
 * Format date in IST (DD MMM YYYY)
 */
function _formatTrailDate(timestamp) {
    try {
        const d = new Date(timestamp);
        return d.toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    } catch {
        return '—';
    }
}

/**
 * Render file attachment card with icon and metadata
 */
function _renderFileAttachment(fileName, filePath) {
    const ext = (fileName.split('.').pop() || '').toLowerCase();
    
    const fileTypeMap = {
        'pdf': { icon: 'fa-file-pdf', color: '#ef4444', label: 'PDF' },
        'jpg': { icon: 'fa-file-image', color: '#10b981', label: 'Image' },
        'jpeg': { icon: 'fa-file-image', color: '#10b981', label: 'Image' },
        'png': { icon: 'fa-file-image', color: '#10b981', label: 'Image' },
        'gif': { icon: 'fa-file-image', color: '#10b981', label: 'Image' },
        'webp': { icon: 'fa-file-image', color: '#10b981', label: 'Image' },
        'doc': { icon: 'fa-file-word', color: '#2563eb', label: 'Word' },
        'docx': { icon: 'fa-file-word', color: '#2563eb', label: 'Word' },
        'xls': { icon: 'fa-file-excel', color: '#16a34a', label: 'Excel' },
        'xlsx': { icon: 'fa-file-excel', color: '#16a34a', label: 'Excel' },
        'csv': { icon: 'fa-file-excel', color: '#16a34a', label: 'Excel' },
        'ppt': { icon: 'fa-file-powerpoint', color: '#ea580c', label: 'PowerPoint' },
        'pptx': { icon: 'fa-file-powerpoint', color: '#ea580c', label: 'PowerPoint' },
        'mp4': { icon: 'fa-file-video', color: '#7c3aed', label: 'Video' },
        'mov': { icon: 'fa-file-video', color: '#7c3aed', label: 'Video' },
        'avi': { icon: 'fa-file-video', color: '#7c3aed', label: 'Video' },
        'txt': { icon: 'fa-file-lines', color: '#64748b', label: 'Text' },
        'md': { icon: 'fa-file-lines', color: '#64748b', label: 'Markdown' }
    };
    
    const fileInfo = fileTypeMap[ext] || { 
        icon: 'fa-file', 
        color: '#6b7280', 
        label: 'File' 
    };
    
    const safePath = window.escapeHtml(filePath);
    const safeName = window.escapeHtml(fileName);
    
    return `
        <div class="inline-flex items-center gap-2 px-3 py-2 rounded-lg border-2 bg-white cursor-pointer 
                    hover:shadow-md transition-all duration-200" 
             onclick="window.openSecureFile('${safePath}')"
             style="border-color: ${fileInfo.color}20; background: ${fileInfo.color}08;"
             title="Click to open: ${safeName}">
            <i class="fa-solid ${fileInfo.icon}" 
               style="color: ${fileInfo.color}; font-size: 18px; flex-shrink: 0;"></i>
            <div class="flex flex-col min-w-0">
                <span class="text-xs font-bold text-gray-800 truncate">${safeName}</span>
                <span class="text-[10px] text-gray-500">${fileInfo.label}</span>
            </div>
            <i class="fa-solid fa-arrow-up-right text-xs ml-1 flex-shrink-0" 
               style="color: ${fileInfo.color}; opacity: 0.6;"></i>
        </div>
    `;
}

/**
 * Render a single trail entry with professional styling
 */
function _renderTrailEntry(trail, index, totalCount) {
    const actionType = _detectActionType(trail);
    const config = TRAIL_ACTION_CONFIG[actionType] || TRAIL_ACTION_CONFIG.UPDATE;
    
    const userName = window.toSentenceCase(
        (trail.profiles?.full_name || trail.profiles?.email || 'System').split('@')[0]
    );
    const userInitials = _getInitials(trail.profiles?.full_name, trail.profiles?.email);
    const timeStr = _formatTrailTime(trail.created_at);
    const dateStr = _formatTrailDate(trail.created_at);
    
    // Serial number: count down from total
    const entryNumber = totalCount - index;
    
    let contentHtml = '';
    
    if (trail.action === 'FILE' && trail.comment) {
        const [fileName, filePath] = trail.comment.includes('|') 
            ? trail.comment.split('|') 
            : [trail.comment, trail.comment];
        contentHtml = `
            <div class="mb-2">
                ${_renderFileAttachment(fileName, filePath)}
            </div>
        `;
    }
    
    if (trail.comment && trail.action !== 'FILE') {
        const commentText = window.escapeHtml(trail.comment);
        contentHtml += `
            <p class="text-sm leading-relaxed" style="color: var(--text-primary);">
                ${commentText}
            </p>
        `;
    }
    
    return `
        <div class="relative pl-8 pb-6 last:pb-0">
            <!-- Timeline dot -->
            <div class="absolute left-0 top-1 w-6 h-6 rounded-full border-2 flex items-center justify-center"
                 style="background: ${config.bgColor}; border-color: ${config.borderColor};">
                <i class="fa-solid ${config.icon} text-xs" style="color: ${config.borderColor};"></i>
            </div>
            
            <!-- Timeline line -->
            <div class="absolute left-3 top-8 w-0.5 bottom-0" 
                 style="background: ${config.borderColor}20; opacity: 0.3;"></div>
            
            <!-- Content card -->
            <div class="rounded-lg border-l-4 p-3 bg-white hover:shadow-sm transition-shadow"
                 style="border-left-color: ${config.borderColor}; background: ${config.bgColor}20;">
                
                <!-- Header: User + Time -->
                <div class="flex items-center justify-between mb-2">
                    <div class="flex items-center gap-2 min-w-0">
                        <!-- User avatar -->
                        <div class="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
                             style="background: ${config.borderColor}; color: white;">
                            ${userInitials}
                        </div>
                        
                        <!-- User name + entry number -->
                        <div class="min-w-0">
                            <div class="text-xs font-bold truncate" style="color: ${config.textColor};">
                                #${entryNumber} · ${window.escapeHtml(userName)}
                            </div>
                            <div class="text-[10px] text-gray-500">
                                ${dateStr} · ${timeStr}
                            </div>
                        </div>
                    </div>
                    
                    <!-- Action badge -->
                    <span class="text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap flex-shrink-0 ml-2"
                          style="background: ${config.borderColor}; color: white;">
                        ${config.label}
                    </span>
                </div>
                
                <!-- Content -->
                <div class="ml-9">
                    ${contentHtml || '<p class="text-xs text-gray-500 italic">No details provided</p>'}
                </div>
            </div>
        </div>
    `;
}

/**
 * Main trail renderer: builds complete professional audit trail HTML
 */
window.renderProfessionalTrail = function(trailList) {
    if (!trailList || trailList.length === 0) {
        return `
            <div class="text-center py-8 px-4">
                <i class="fa-solid fa-inbox text-3xl text-gray-300 mb-3 block"></i>
                <p class="text-sm text-gray-500 font-medium">No activity recorded yet</p>
                <p class="text-xs text-gray-400 mt-1">All task changes will appear here</p>
            </div>
        `;
    }
    
    return `
        <div class="space-y-1">
            ${trailList.map((trail, idx) => 
                _renderTrailEntry(trail, idx, trailList.length)
            ).join('')}
        </div>
    `;
};

/**
 * Compact trail renderer for inline display (used in lists, previews)
 */
window.renderCompactTrail = function(trailList, maxItems = 3) {
    if (!trailList || trailList.length === 0) {
        return '<p class="text-xs text-gray-400 italic">No activity</p>';
    }
    
    const recentTrails = trailList.slice(0, maxItems);
    const more = trailList.length - maxItems;
    
    return `
        <div class="space-y-2">
            ${recentTrails.map(trail => {
                const userName = window.toSentenceCase(
                    (trail.profiles?.full_name || trail.profiles?.email || 'System').split('@')[0]
                );
                const timeStr = _formatTrailTime(trail.created_at);
                const actionType = _detectActionType(trail);
                const config = TRAIL_ACTION_CONFIG[actionType] || TRAIL_ACTION_CONFIG.UPDATE;
                
                return `
                    <div class="flex items-start gap-2 text-xs">
                        <i class="fa-solid ${config.icon} text-xs flex-shrink-0 mt-0.5" 
                           style="color: ${config.borderColor};"></i>
                        <div class="min-w-0 flex-1">
                            <div class="font-medium text-gray-800">
                                ${window.escapeHtml(userName)}
                                <span class="text-gray-500 font-normal">${config.label}</span>
                            </div>
                            <div class="text-gray-500">${timeStr}</div>
                        </div>
                    </div>
                `;
            }).join('')}
            ${more > 0 ? `<p class="text-xs text-blue-600 font-medium mt-1">+${more} more</p>` : ''}
        </div>
    `;
};

/**
 * Integration hook: replace old trail rendering in tasks.js
 * Usage in loadTasksForPanel():
 *   Replace:   ${trailRows || '<div class="text-xs text-gray-400 italic">No activity yet.</div>'}
 *   With:      ${window.renderProfessionalTrail(trlList)}
 */
window.toggleTrail = function(taskId) {
    const trailBox = document.getElementById(`trail-${taskId}`);
    if (!trailBox) return;
    
    const isHidden = trailBox.style.display === 'none';
    trailBox.style.display = isHidden ? 'block' : 'none';
    
    // Rotate chevron
    const btn = trailBox.parentElement?.querySelector('button');
    if (btn) {
        const chevron = btn.querySelector('.fa-chevron-down');
        if (chevron) {
            chevron.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(-180deg)';
            chevron.style.transition = 'transform 0.3s ease';
        }
    }
};

export { renderProfessionalTrail, renderCompactTrail };
